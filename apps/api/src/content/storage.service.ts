import { Inject, Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl as s3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSignedCookies, getSignedUrl as cfSignedUrl } from '@aws-sdk/cloudfront-signer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { hmacHex, safeEqual } from '../common/crypto.js';

/**
 * Content pack and media storage. Production: S3 (encrypted with KMS) served through
 * CloudFront signed URLs. Development: a local folder served by the API with HMAC signed links.
 */
@Injectable()
export class StorageService {
  private readonly s3: S3Client | null;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.s3 = env.STORAGE_DRIVER === 's3' ? new S3Client({ region: env.AWS_REGION }) : null;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: 'aws:kms', CacheControl: 'private, max-age=31536000, immutable' }));
      return;
    }
    const path = this.localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string): Promise<Buffer> {
    if (this.s3) {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    }
    return readFile(this.localPath(key));
  }

  /** A link that expires, so a shared link stops working. */
  async signedUrl(key: string, ttlSeconds = 3600): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    if (this.env.CLOUDFRONT_DOMAIN && this.env.CLOUDFRONT_KEY_PAIR_ID && this.env.CLOUDFRONT_PRIVATE_KEY) {
      return cfSignedUrl({
        url: `https://${this.env.CLOUDFRONT_DOMAIN}/${key}`,
        keyPairId: this.env.CLOUDFRONT_KEY_PAIR_ID,
        privateKey: this.env.CLOUDFRONT_PRIVATE_KEY,
        dateLessThan: new Date(expires * 1000).toISOString(),
      });
    }
    if (this.s3) return s3SignedUrl(this.s3, new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }), { expiresIn: ttlSeconds });
    const sig = this.localSignature(key, expires);
    return `${this.env.PUBLIC_API_URL}/api/v1/content/files?key=${encodeURIComponent(key)}&expires=${expires}&sig=${sig}`;
  }

  /** Signed cookies cover every HLS segment under a video's folder. */
  signedCookiesForPrefix(prefix: string, ttlSeconds = 4 * 3600): Record<string, string> | null {
    if (!this.env.CLOUDFRONT_DOMAIN || !this.env.CLOUDFRONT_KEY_PAIR_ID || !this.env.CLOUDFRONT_PRIVATE_KEY) return null;
    const policy = JSON.stringify({
      Statement: [{ Resource: `https://${this.env.CLOUDFRONT_DOMAIN}/${prefix}*`, Condition: { DateLessThan: { 'AWS:EpochTime': Math.floor(Date.now() / 1000) + ttlSeconds } } }],
    });
    return getSignedCookies({ keyPairId: this.env.CLOUDFRONT_KEY_PAIR_ID, privateKey: this.env.CLOUDFRONT_PRIVATE_KEY, policy }) as unknown as Record<string, string>;
  }

  publicUrl(key: string): string {
    return this.env.CLOUDFRONT_DOMAIN ? `https://${this.env.CLOUDFRONT_DOMAIN}/${key}` : `${this.env.PUBLIC_API_URL}/media/${key}`;
  }

  verifyLocalSignature(key: string, expires: number, sig: string): boolean {
    return expires > Date.now() / 1000 && safeEqual(this.localSignature(key, expires), sig);
  }

  private localSignature(key: string, expires: number): string {
    return hmacHex('sha256', this.env.JWT_ACCESS_SECRET, `${key}:${expires}`);
  }

  private localPath(key: string): string {
    const root = resolve(this.env.LOCAL_STORAGE_DIR);
    const path = resolve(join(root, key));
    if (!path.startsWith(root)) throw new Error('Invalid storage key');
    return path;
  }
}

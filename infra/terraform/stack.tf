# One Ugo environment. Each environment (dev, staging, prod) calls this with its own settings,
# so they never share databases, buckets or keys.

terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

variable "environment" { type = string }
variable "vpc_cidr" { type = string }
variable "api_certificate_arn" { type = string }
variable "cloudfront_signing_public_key_pem" { type = string }
variable "admin_allowed_cidrs" { type = list(string) }
variable "alert_email" { type = string }
variable "api_image_tag" {
  type    = string
  default = "latest"
}
variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "min_api_tasks" {
  type    = number
  default = 2
}
variable "max_api_tasks" {
  type    = number
  default = 12
}
variable "single_nat_gateway" {
  type    = bool
  default = false
}

locals {
  name = "ugo-${var.environment}"
}

module "network" {
  source             = "./modules/network"
  name               = local.name
  cidr               = var.vpc_cidr
  single_nat_gateway = var.single_nat_gateway
}

module "media" {
  source                 = "./modules/media"
  name                   = local.name
  signing_public_key_pem = var.cloudfront_signing_public_key_pem
}

module "app" {
  source             = "./modules/app"
  name               = local.name
  vpc_id             = module.network.vpc_id
  public_subnet_ids  = module.network.public_subnet_ids
  private_subnet_ids = module.network.private_subnet_ids
  certificate_arn    = var.api_certificate_arn
  image_tag          = var.api_image_tag
  min_tasks          = var.min_api_tasks
  max_tasks          = var.max_api_tasks
  media_bucket_arn   = module.media.media_bucket_arn
  db_kms_key_arn     = module.database.kms_key_arn
  environment = {
    NODE_ENV               = var.environment == "prod" ? "production" : "staging"
    PORT                   = "3000"
    STORAGE_DRIVER         = "s3"
    S3_BUCKET              = module.media.media_bucket
    CLOUDFRONT_DOMAIN      = module.media.media_domain
    CLOUDFRONT_KEY_PAIR_ID = module.media.signing_key_pair_id
    EMAIL_DRIVER           = "ses"
    ADMIN_IP_ALLOWLIST     = join(",", var.admin_allowed_cidrs)
    APPLE_ENVIRONMENT      = var.environment == "prod" ? "Production" : "Sandbox"
  }
}

module "database" {
  source                     = "./modules/database"
  name                       = local.name
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.isolated_subnet_ids
  allowed_security_group_ids = [module.app.api_security_group_id]
  instance_class             = var.db_instance_class
  multi_az                   = true
  deletion_protection        = var.environment == "prod"
}

module "cache" {
  source                     = "./modules/cache"
  name                       = local.name
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.isolated_subnet_ids
  allowed_security_group_ids = [module.app.api_security_group_id]
}

module "edge" {
  source              = "./modules/edge"
  name                = local.name
  alb_arn             = module.app.alb_arn
  admin_allowed_cidrs = var.admin_allowed_cidrs
}

data "aws_db_instance" "this" {
  db_instance_identifier = module.database.instance_id
}

module "monitoring" {
  source                  = "./modules/monitoring"
  name                    = local.name
  alert_email             = var.alert_email
  alb_arn_suffix          = module.app.alb_arn_suffix
  target_group_arn_suffix = module.app.target_group_arn_suffix
  db_instance_id          = module.database.instance_id
  db_instance_arn         = data.aws_db_instance.this.db_instance_arn
  api_log_group           = module.app.log_group_name
}

output "api_alb_dns_name" { value = module.app.alb_dns_name }
output "ecr_repository_url" { value = module.app.ecr_repository_url }
output "ecs_cluster" { value = module.app.cluster_name }
output "ecs_service" { value = module.app.service_name }
output "media_cdn_domain" { value = module.media.media_domain }
output "db_endpoint" { value = module.database.endpoint }
output "redis_endpoint" { value = module.cache.endpoint }
output "app_secret_arn" { value = module.app.app_secret_arn }
output "admin_site_bucket" { value = module.media.admin_bucket }

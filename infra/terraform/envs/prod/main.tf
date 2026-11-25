# Ugo prod environment. Run from this folder:
#   terraform init -backend-config=backend.hcl
#   terraform plan -var-file=prod.tfvars
terraform {
  required_version = ">= 1.9"
  backend "s3" {}
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "region" {
  type        = string
  description = "AWS region closest to Nigerian users. Confirm with latency tests from Lagos, Abuja and Port Harcourt (see docs/DEPLOYMENT.md)."
  default     = "af-south-1"
}
variable "api_certificate_arn" { type = string }
variable "cloudfront_signing_public_key_pem" { type = string }
variable "admin_allowed_cidrs" { type = list(string) }
variable "alert_email" { type = string }
variable "api_image_tag" {
  type    = string
  default = "latest"
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "ugo", Environment = "prod", ManagedBy = "terraform" }
  }
}

module "ugo" {
  source                            = "../../"
  environment                       = "prod"
  vpc_cidr                          = "10.30.0.0/16"
  single_nat_gateway                = false
  db_instance_class                 = "db.r7g.large"
  min_api_tasks                     = 2
  max_api_tasks                     = 20
  api_certificate_arn               = var.api_certificate_arn
  cloudfront_signing_public_key_pem = var.cloudfront_signing_public_key_pem
  admin_allowed_cidrs               = var.admin_allowed_cidrs
  alert_email                       = var.alert_email
  api_image_tag                     = var.api_image_tag
}

output "outputs" { value = module.ugo }

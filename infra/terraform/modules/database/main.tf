# PostgreSQL 16, Multi-AZ, encrypted with a customer managed KMS key (AES-256), in isolated subnets.
# Daily snapshots with point in time recovery; TLS required for every connection.

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_group_ids" { type = list(string) }
variable "instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "multi_az" {
  type    = bool
  default = true
}
variable "backup_retention_days" {
  type    = number
  default = 14
}
variable "deletion_protection" {
  type    = bool
  default = true
}

resource "aws_kms_key" "db" {
  description         = "${var.name} database encryption"
  enable_key_rotation = true
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "db" {
  name   = "${var.name}-db"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-pg16"
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
}

resource "aws_db_instance" "this" {
  identifier                          = var.name
  engine                              = "postgres"
  engine_version                      = "16"
  instance_class                      = var.instance_class
  allocated_storage                   = 50
  max_allocated_storage               = 500
  storage_type                        = "gp3"
  storage_encrypted                   = true
  kms_key_id                          = aws_kms_key.db.arn
  db_name                             = "ugo"
  username                            = "ugo_admin"
  manage_master_user_password         = true
  multi_az                            = var.multi_az
  db_subnet_group_name                = aws_db_subnet_group.this.name
  vpc_security_group_ids              = [aws_security_group.db.id]
  parameter_group_name                = aws_db_parameter_group.this.name
  publicly_accessible                 = false
  backup_retention_period             = var.backup_retention_days
  backup_window                       = "01:00-02:00"
  maintenance_window                  = "sun:02:30-sun:03:30"
  copy_tags_to_snapshot               = true
  deletion_protection                 = var.deletion_protection
  skip_final_snapshot                 = false
  final_snapshot_identifier           = "${var.name}-final"
  performance_insights_enabled        = true
  performance_insights_kms_key_id     = aws_kms_key.db.arn
  enabled_cloudwatch_logs_exports     = ["postgresql"]
  auto_minor_version_upgrade          = true
  iam_database_authentication_enabled = true
}

output "endpoint" { value = aws_db_instance.this.address }
output "master_secret_arn" { value = aws_db_instance.this.master_user_secret[0].secret_arn }
output "instance_id" { value = aws_db_instance.this.identifier }
output "kms_key_arn" { value = aws_kms_key.db.arn }

# Alerts for errors, slow responses, database health, unusual sign in failures and payment problems,
# plus encrypted daily backups with AWS Backup. Restores are tested every quarter (docs/MAINTENANCE_PLAN.md).

variable "name" { type = string }
variable "alert_email" { type = string }
variable "alb_arn_suffix" { type = string }
variable "target_group_arn_suffix" { type = string }
variable "db_instance_id" { type = string }
variable "db_instance_arn" { type = string }
variable "api_log_group" { type = string }

resource "aws_sns_topic" "alerts" {
  name              = "${var.name}-alerts"
  kms_master_key_id = "alias/aws/sns"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

locals {
  alarms = {
    api-5xx       = { ns = "AWS/ApplicationELB", metric = "HTTPCode_Target_5XX_Count", stat = "Sum", threshold = 25, dims = { LoadBalancer = var.alb_arn_suffix } }
    api-latency   = { ns = "AWS/ApplicationELB", metric = "TargetResponseTime", stat = "Average", threshold = 1, dims = { LoadBalancer = var.alb_arn_suffix } }
    api-unhealthy = { ns = "AWS/ApplicationELB", metric = "UnHealthyHostCount", stat = "Maximum", threshold = 0, dims = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.target_group_arn_suffix } }
    db-cpu        = { ns = "AWS/RDS", metric = "CPUUtilization", stat = "Average", threshold = 80, dims = { DBInstanceIdentifier = var.db_instance_id } }
  }
}

resource "aws_cloudwatch_metric_alarm" "this" {
  for_each            = local.alarms
  alarm_name          = "${var.name}-${each.key}"
  namespace           = each.value.ns
  metric_name         = each.value.metric
  statistic           = each.value.stat
  dimensions          = each.value.dims
  period              = 300
  evaluation_periods  = 2
  threshold           = each.value.threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "db_storage" {
  alarm_name          = "${var.name}-db-free-storage"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Minimum"
  dimensions          = { DBInstanceIdentifier = var.db_instance_id }
  period              = 300
  evaluation_periods  = 1
  threshold           = 5368709120
  comparison_operator = "LessThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# The API writes JSON logs; audit actions are logged with these names.
resource "aws_cloudwatch_log_metric_filter" "failed_logins" {
  name           = "${var.name}-failed-logins"
  log_group_name = var.api_log_group
  pattern        = "\"Wrong email or password\""
  metric_transformation {
    name      = "FailedLogins"
    namespace = "Ugo/${var.name}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "failed_logins" {
  alarm_name          = "${var.name}-unusual-failed-logins"
  namespace           = "Ugo/${var.name}"
  metric_name         = "FailedLogins"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 200
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_log_metric_filter" "payment_errors" {
  name           = "${var.name}-payment-errors"
  log_group_name = var.api_log_group
  pattern        = "?\"Paystack error\" ?\"Flutterwave error\" ?\"PURCHASE_OWNED_BY_ANOTHER_ACCOUNT\" ?\"Bad signature\""
  metric_transformation {
    name      = "PaymentErrors"
    namespace = "Ugo/${var.name}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "payment_errors" {
  alarm_name          = "${var.name}-payment-errors"
  namespace           = "Ugo/${var.name}"
  metric_name         = "PaymentErrors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_kms_key" "backup" {
  description         = "${var.name} backup vault"
  enable_key_rotation = true
}

resource "aws_backup_vault" "this" {
  name        = "${var.name}-vault"
  kms_key_arn = aws_kms_key.backup.arn
}

resource "aws_backup_plan" "daily" {
  name = "${var.name}-daily"
  rule {
    rule_name                = "daily-35-days"
    target_vault_name        = aws_backup_vault.this.name
    schedule                 = "cron(0 0 * * ? *)"
    enable_continuous_backup = true
    lifecycle { delete_after = 35 }
  }
}

resource "aws_iam_role" "backup" {
  name = "${var.name}-backup"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "backup.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_backup_selection" "db" {
  name         = "${var.name}-db"
  plan_id      = aws_backup_plan.daily.id
  iam_role_arn = aws_iam_role.backup.arn
  resources    = [var.db_instance_arn]
}

output "alerts_topic_arn" { value = aws_sns_topic.alerts.arn }

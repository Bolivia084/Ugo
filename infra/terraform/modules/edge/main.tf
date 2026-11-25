# Web Application Firewall on the API load balancer: AWS managed rules, rate limits
# (tighter on sign in and codes), and admin routes only from the allowlisted networks.
# AWS Shield Standard (DDoS protection) is on by default for ALB and CloudFront.

variable "name" { type = string }
variable "alb_arn" { type = string }
variable "admin_allowed_cidrs" { type = list(string) }

resource "aws_wafv2_ip_set" "admin" {
  name               = "${var.name}-admin-allow"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = var.admin_allowed_cidrs
}

resource "aws_wafv2_web_acl" "api" {
  name  = "${var.name}-api"
  scope = "REGIONAL"
  default_action {
    allow {}
  }

  rule {
    name     = "admin-only-from-allowlist"
    priority = 0
    action {
      block {}
    }
    statement {
      and_statement {
        statement {
          byte_match_statement {
            search_string         = "/admin"
            positional_constraint = "CONTAINS"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
        statement {
          not_statement {
            statement {
              ip_set_reference_statement { arn = aws_wafv2_ip_set.admin.arn }
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "admin-block"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "auth-rate-limit"
    priority = 1
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 300
        aggregate_key_type = "IP"
        scope_down_statement {
          byte_match_statement {
            search_string         = "/auth/"
            positional_constraint = "CONTAINS"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "auth-rate"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "global-rate-limit"
    priority = 2
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 3000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "global-rate"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = { AWSManagedRulesAmazonIpReputationList = 10, AWSManagedRulesCommonRuleSet = 11, AWSManagedRulesKnownBadInputsRuleSet = 12, AWSManagedRulesSQLiRuleSet = 13 }
    content {
      name     = rule.key
      priority = rule.value
      override_action {
        none {}
      }
      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.key
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.key
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-api"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "api" {
  resource_arn = var.alb_arn
  web_acl_arn  = aws_wafv2_web_acl.api.arn
}

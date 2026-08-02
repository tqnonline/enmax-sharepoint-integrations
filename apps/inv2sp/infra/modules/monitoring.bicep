// ============================================================================
// Monitoring module - Action Group (email) + 3 native Azure Monitor alert
// rules on the Logic App resource.
// ----------------------------------------------------------------------------
// Metric names verified directly against the live dev Logic App resource
// via `az monitor metrics list-definitions` on 2026-08-01 (correctness
// review caught that an earlier draft used Consumption-Logic-App metric
// names - e.g. "RunsFailed" - that do not exist on Microsoft.Web/sites;
// Standard Logic Apps expose a different, "Workflow"-prefixed metric set
// under namespace Microsoft.Web/sites). None of these require a
// workflowName dimension (isDimensionRequired=false) - they aggregate
// across every workflow hosted on this site, which is the intended
// system-wide behavior for v1. Per-workflow scoping can be added once
// Phase 3's workflow names exist, if ever needed.
//
// Action Groups cannot reference Key Vault secrets - alert recipients must
// be literal at deploy time. To avoid the recipient list living in two
// places, Deploy-All.ps1 deploys Key Vault first, seeds alertEmailTo, reads
// it back, and passes it into this module as a parameter (single source of
// truth, ordered two-stage deploy - decision, 2026-08-01).
//
// Connection health (office365/sharepointonline OAuth token status) is
// deliberately NOT a metric alert here - it is checked by
// scripts/Test-Connections.ps1, run daily via the connection-health.yml
// GitHub Actions workflow (Phase 5), since connection status is not a
// native Azure Monitor metric.
// ============================================================================

@description('Logic App resource id (Microsoft.Web/sites) to alert on.')
param logicAppId string

@description('Resource tags.')
param tags object = {}

@description('Alert recipient email addresses (technical distribution list) - literal values, read from Key Vault secret alertEmailTo by the calling script before this module runs.')
param alertRecipients array

@description('Hours of no successful run before the dead-man\'s-switch alert fires.')
param deadmanThresholdHours int = 2

@description('Environment short name used in alert naming, e.g. T or P.')
param environmentSuffix string

var actionGroupName = 'ag-inv2sp-${toLower(environmentSuffix)}'
var emailReceivers = [for (email, i) in alertRecipients: {
  name: 'email-${i}'
  emailAddress: email
  useCommonAlertSchema: true
}]

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: actionGroupName
  location: 'global'
  tags: tags
  properties: {
    groupShortName: take('inv2sp${environmentSuffix}', 12)
    enabled: true
    emailReceivers: emailReceivers
  }
}

resource deadmanSwitchAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-inv2sp-${environmentSuffix}-no-successful-run'
  location: 'global'
  tags: tags
  properties: {
    description: 'Fires when this Logic App has had zero completed-Succeeded workflow runs (any workflow hosted on the site) within the evaluation window - the only control that catches a completely stopped or unreachable integration, since a dead workflow cannot send its own alert email.'
    severity: 1
    enabled: true
    scopes: [
      logicAppId
    ]
    evaluationFrequency: 'PT15M'
    windowSize: 'PT${deadmanThresholdHours}H'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'NoSuccessfulRuns'
          metricName: 'WorkflowRunsCompleted'
          metricNamespace: 'Microsoft.Web/sites'
          operator: 'LessThan'
          threshold: 1
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
          dimensions: [
            {
              name: 'status'
              operator: 'Include'
              values: [
                'Succeeded'
              ]
            }
          ]
        }
      ]
    }
    autoMitigate: true
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

resource triggerFailuresAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-inv2sp-${environmentSuffix}-trigger-failures'
  location: 'global'
  tags: tags
  properties: {
    description: 'Fires when any workflow trigger fails - typically indicates the gateway or file share is unreachable, meaning the workflow never starts and cannot self-report.'
    severity: 1
    enabled: true
    scopes: [
      logicAppId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'TriggerFailureRate'
          metricName: 'WorkflowTriggersFailureRate'
          metricNamespace: 'Microsoft.Web/sites'
          operator: 'GreaterThan'
          threshold: 0
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    autoMitigate: true
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

resource runFailuresAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-inv2sp-${environmentSuffix}-run-failures'
  location: 'global'
  tags: tags
  properties: {
    description: 'Backstop for in-workflow error handling - fires on any run-level (not per-file) failure within the window, across any workflow hosted on this site.'
    severity: 2
    enabled: true
    scopes: [
      logicAppId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'RunFailureRate'
          metricName: 'WorkflowRunsFailureRate'
          metricNamespace: 'Microsoft.Web/sites'
          operator: 'GreaterThan'
          threshold: 0
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    autoMitigate: true
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

output actionGroupId string = actionGroup.id

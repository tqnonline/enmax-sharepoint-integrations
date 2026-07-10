/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is auto-generated. Do not modify it manually.
 * Changes to this file may be overwritten.
 */

export const dataSourcesInfo = {
  "whoami": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "WhoAmI": {
        "path": "/api/data/v9.2/WhoAmI",
        "method": "GET",
        "parameters": [],
        "responseInfo": {
          "200": {
            "type": "object"
          }
        }
      }
    }
  },
  "enmax_autocadappconfigs": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadappconfigid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocadassets": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadassetid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocadbusinesses": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadbusinessid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocaddomains": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocaddomainid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocadinappnotifications": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadinappnotificationid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocadkinds": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadkindid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocadreservations": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadreservationid",
    "dataSourceType": "Dataverse",
    "apis": {
      "enmax_acdnApproveReservation": {
        "path": "/api/data/v9.2/enmax_acdnApproveReservation",
        "method": "POST",
        "parameters": [
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" },
          { "name": "Target", "in": "body", "required": true, "type": "object" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      },
      "enmax_acdnDeclineReservation": {
        "path": "/api/data/v9.2/enmax_acdnDeclineReservation",
        "method": "POST",
        "parameters": [
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" },
          { "name": "Target", "in": "body", "required": true, "type": "object" },
          { "name": "Reason", "in": "body", "required": false, "type": "string" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      },
      "enmax_acdnCreateDrawings": {
        "path": "/api/data/v9.2/enmax_acdnCreateDrawings",
        "method": "POST",
        "parameters": [
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" },
          { "name": "Target", "in": "body", "required": true, "type": "object" },
          { "name": "IssuedNumbers", "in": "body", "required": true, "type": "string" },
          { "name": "SequenceKey", "in": "body", "required": true, "type": "string" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      }
    }
  },
  "enmax_autocadsystems": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadsystemid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocadsystemscopes": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadsystemscopeid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocaddrawings": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocaddrawingid",
    "dataSourceType": "Dataverse",
    "apis": {
      "enmax_acdnCheckOutDrawing": {
        "path": "/api/data/v9.2/enmax_autocaddrawings({drawingId})/Microsoft.Dynamics.CRM.enmax_acdnCheckOutDrawing",
        "method": "POST",
        "parameters": [
          { "name": "drawingId", "in": "path", "required": true, "type": "string" },
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      },
      "enmax_acdnFinalizeDrawing": {
        "path": "/api/data/v9.2/enmax_autocaddrawings({drawingId})/Microsoft.Dynamics.CRM.enmax_acdnFinalizeDrawing",
        "method": "POST",
        "parameters": [
          { "name": "drawingId", "in": "path", "required": true, "type": "string" },
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" },
          { "name": "Reason", "in": "body", "required": true, "type": "string" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      },
      "enmax_acdnMarkObsolete": {
        "path": "/api/data/v9.2/enmax_autocaddrawings({drawingId})/Microsoft.Dynamics.CRM.enmax_acdnMarkObsolete",
        "method": "POST",
        "parameters": [
          { "name": "drawingId", "in": "path", "required": true, "type": "string" },
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" },
          { "name": "Reason", "in": "body", "required": false, "type": "string" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      },
      "enmax_acdnReleaseDrawing": {
        "path": "/api/data/v9.2/enmax_autocaddrawings({drawingId})/Microsoft.Dynamics.CRM.enmax_acdnReleaseDrawing",
        "method": "POST",
        "parameters": [
          { "name": "drawingId", "in": "path", "required": true, "type": "string" },
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" },
          { "name": "Reason", "in": "body", "required": true, "type": "string" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      }
    }
  },
  "enmax_autocadsheets": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadsheetid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocadcheckouts": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadcheckoutid",
    "dataSourceType": "Dataverse",
    "apis": {
      "enmax_acdnSubmitRevision": {
        "path": "/api/data/v9.2/enmax_autocadcheckouts({checkoutId})/Microsoft.Dynamics.CRM.enmax_acdnSubmitRevision",
        "method": "POST",
        "parameters": [
          { "name": "checkoutId", "in": "path", "required": true, "type": "string" },
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" },
          { "name": "SubmissionInfo", "in": "body", "required": true, "type": "string" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      },
      "enmax_acdnApproveCheckin": {
        "path": "/api/data/v9.2/enmax_autocadcheckouts({checkoutId})/Microsoft.Dynamics.CRM.enmax_acdnApproveCheckin",
        "method": "POST",
        "parameters": [
          { "name": "checkoutId", "in": "path", "required": true, "type": "string" },
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" },
          { "name": "Decision", "in": "body", "required": true, "type": "integer" },
          { "name": "Reason", "in": "body", "required": false, "type": "string" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      },
      "enmax_acdnApproveCheckout": {
        "path": "/api/data/v9.2/enmax_autocadcheckouts({checkoutId})/Microsoft.Dynamics.CRM.enmax_acdnApproveCheckout",
        "method": "POST",
        "parameters": [
          { "name": "checkoutId", "in": "path", "required": true, "type": "string" },
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" },
          { "name": "Decision", "in": "body", "required": true, "type": "integer" },
          { "name": "Reason", "in": "body", "required": false, "type": "string" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      },
      "enmax_acdnForceCheckin": {
        "path": "/api/data/v9.2/enmax_autocadcheckouts({checkoutId})/Microsoft.Dynamics.CRM.enmax_acdnForceCheckin",
        "method": "POST",
        "parameters": [
          { "name": "checkoutId", "in": "path", "required": true, "type": "string" },
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" },
          { "name": "NewRevision", "in": "body", "required": false, "type": "string" },
          { "name": "Reason", "in": "body", "required": true, "type": "string" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      }
    }
  },
  "enmax_acdncheckoutsheets": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "enmax_acdnCheckOutSheets": {
        "path": "/api/data/v9.2/enmax_acdnCheckOutSheets",
        "method": "POST",
        "parameters": [
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" },
          { "name": "Sheets", "in": "body", "required": false, "type": "string" },
          { "name": "Drawing", "in": "body", "required": false, "type": "object" },
          { "name": "AllAvailable", "in": "body", "required": false, "type": "boolean" },
          { "name": "BatchId", "in": "body", "required": false, "type": "string" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      }
    }
  },
  "enmax_acdnissuenumbers": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "enmax_acdnIssueNumbers": {
        "path": "/api/data/v9.2/enmax_acdnIssueNumbers",
        "method": "POST",
        "parameters": [
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" },
          { "name": "Business", "in": "body", "required": false, "type": "string" },
          { "name": "Asset", "in": "body", "required": false, "type": "string" },
          { "name": "Unit", "in": "body", "required": false, "type": "string" },
          { "name": "Domain", "in": "body", "required": false, "type": "string" },
          { "name": "System", "in": "body", "required": false, "type": "string" },
          { "name": "Kind", "in": "body", "required": false, "type": "string" },
          { "name": "Count", "in": "body", "required": true, "type": "integer" },
          { "name": "Reservation", "in": "body", "required": false, "type": "object" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      }
    }
  },
  "enmax_acdnaddchilditems": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "enmax_acdnAddChildItems": {
        "path": "/api/data/v9.2/enmax_acdnAddChildItems",
        "method": "POST",
        "parameters": [
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" },
          { "name": "Drawing", "in": "body", "required": true, "type": "object" },
          { "name": "Count", "in": "body", "required": true, "type": "integer" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      }
    }
  },
  "enmax_acdnupsertsharepointlinks": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "enmax_acdnUpsertSharePointLinks": {
        "path": "/api/data/v9.2/enmax_acdnUpsertSharePointLinks",
        "method": "POST",
        "parameters": [
          { "name": "ActingUserId", "in": "body", "required": false, "type": "string" },
          { "name": "Target", "in": "body", "required": true, "type": "object" },
          { "name": "RecordNumber", "in": "body", "required": true, "type": "string" },
          { "name": "FoundFiles", "in": "body", "required": false, "type": "string" }
        ],
        "responseInfo": { "200": { "type": "object" } }
      }
    }
  },
  "enmax_autocadnumbersequences": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadnumbersequenceid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocadauditevents": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadauditeventid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocadrecordtypes": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadrecordtypeid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocadrecordphases": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadrecordphaseid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocadvendors": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadvendorid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocadbroadcasts": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadbroadcastid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocadbroadcastdismissals": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadbroadcastdismissalid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocaduserpreferences": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocaduserpreferenceid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "teams": {
    "tableId": "",
    "version": "",
    "primaryKey": "teamid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "enmax_autocadunits": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadunitid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "systemusers": {
    "tableId": "",
    "version": "",
    "primaryKey": "systemuserid",
    "dataSourceType": "Dataverse",
    "apis": {}
  }
};

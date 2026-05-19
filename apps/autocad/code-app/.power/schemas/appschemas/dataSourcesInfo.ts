/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is auto-generated. Do not modify it manually.
 * Changes to this file may be overwritten.
 */

export const dataSourcesInfo = {
  "enmax_autocadappconfigs": {
    "tableId": "",
    "version": "",
    "primaryKey": "enmax_autocadappconfigid",
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
  "systemusers": {
    "tableId": "",
    "version": "",
    "primaryKey": "systemuserid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
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
  }
};

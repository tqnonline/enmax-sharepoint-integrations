export interface RefTableConfig {
  displayName: string;
  entityName: string;
  entityIdField: string;
  isJunction?: boolean;
  junctionFields?: string[];
}

export const REF_TABLES: RefTableConfig[] = [
  { displayName: "Business",                     entityName: "enmax_autocadbusinesses",   entityIdField: "enmax_autocadbusinessid"    },
  { displayName: "Asset",                        entityName: "enmax_autocadassets",        entityIdField: "enmax_autocadassetid"       },
  { displayName: "Unit",                         entityName: "enmax_autocadunits",          entityIdField: "enmax_autocadunitid"        },
  { displayName: "Domain",                       entityName: "enmax_autocaddomains",        entityIdField: "enmax_autocaddomainid"      },
  { displayName: "System",                       entityName: "enmax_autocadsystems",        entityIdField: "enmax_autocadsystemid"      },
  { displayName: "Kind",                         entityName: "enmax_autocadkinds",          entityIdField: "enmax_autocadkindid"        },
  { displayName: "Record Type",                  entityName: "enmax_autocadrecordtypes",    entityIdField: "enmax_autocadrecordtypeid"  },
  { displayName: "Record Phase",                 entityName: "enmax_autocadrecordphases",   entityIdField: "enmax_autocadrecordphaseid" },
  { displayName: "Vendor",                       entityName: "enmax_autocadvendors",        entityIdField: "enmax_autocadvendorid"      },
  { displayName: "System Scoping Rule",          entityName: "enmax_autocadsystemscopes",   entityIdField: "enmax_autocadsystemscopeid",  isJunction: true, junctionFields: ["_enmax_acdnsystem_value"] },
  { displayName: "Number Sequences",             entityName: "enmax_autocadnumbersequences", entityIdField: "enmax_autocadnumbersequenceid" },
];

export const NUMBER_SEQUENCES_IDX = REF_TABLES.length - 1;

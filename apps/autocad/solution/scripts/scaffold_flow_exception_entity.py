#!/usr/bin/env python3
"""One-time transform of copied enmax_autocadbroadcastdismissal → enmax_autocadflowexception."""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
ENTITY_DIR = REPO / "solution/src/Entities/enmax_autocadflowexception"
ENTITY_XML = ENTITY_DIR / "Entity.xml"

OLD = "enmax_autocadbroadcastdismissal"
NEW = "enmax_autocadflowexception"

# Attributes to remove from template (broadcast-specific).
REMOVE_ATTRS = {
    "enmax_acdnAcknowledged",
    "enmax_acdnBroadcast",
    "enmax_acdnDismissedOn",
    "enmax_acdnUser",
}

NEW_ATTRS_XML = """
        <attribute PhysicalName="enmax_acdnOrigin">
          <Type>picklist</Type>
          <Name>enmax_acdnorigin</Name>
          <LogicalName>enmax_acdnorigin</LogicalName>
          <RequiredLevel>required</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IsAuditEnabled>0</IsAuditEnabled>
          <IsSecured>0</IsSecured>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <OptionSetName>enmax_acdn_exceptionorigin</OptionSetName>
          <displaynames>
            <displayname description="Origin" languagecode="1033" />
          </displaynames>
        </attribute>
        <attribute PhysicalName="enmax_acdnSeverity">
          <Type>picklist</Type>
          <Name>enmax_acdnseverity</Name>
          <LogicalName>enmax_acdnseverity</LogicalName>
          <RequiredLevel>required</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IsAuditEnabled>0</IsAuditEnabled>
          <IsSecured>0</IsSecured>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <OptionSetName>enmax_acdn_exceptionseverity</OptionSetName>
          <displaynames>
            <displayname description="Severity" languagecode="1033" />
          </displaynames>
        </attribute>
        <attribute PhysicalName="enmax_acdnErrorMessage">
          <Type>ntext</Type>
          <Name>enmax_acdnerrormessage</Name>
          <LogicalName>enmax_acdnerrormessage</LogicalName>
          <RequiredLevel>required</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <Format>text</Format>
          <MaxLength>2000</MaxLength>
          <displaynames>
            <displayname description="Error Message" languagecode="1033" />
          </displaynames>
        </attribute>
        <attribute PhysicalName="enmax_acdnErrorCode">
          <Type>nvarchar</Type>
          <Name>enmax_acdnerrorcode</Name>
          <LogicalName>enmax_acdnerrorcode</LogicalName>
          <RequiredLevel>none</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <Format>text</Format>
          <MaxLength>100</MaxLength>
          <Length>200</Length>
          <displaynames>
            <displayname description="Error Code" languagecode="1033" />
          </displaynames>
        </attribute>
        <attribute PhysicalName="enmax_acdnErrorDetail">
          <Type>ntext</Type>
          <Name>enmax_acdnerrordetail</Name>
          <LogicalName>enmax_acdnerrordetail</LogicalName>
          <RequiredLevel>none</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <Format>text</Format>
          <MaxLength>100000</MaxLength>
          <displaynames>
            <displayname description="Error Detail" languagecode="1033" />
          </displaynames>
        </attribute>
        <attribute PhysicalName="enmax_acdnFailedAction">
          <Type>nvarchar</Type>
          <Name>enmax_acdnfailedaction</Name>
          <LogicalName>enmax_acdnfailedaction</LogicalName>
          <RequiredLevel>none</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <Format>text</Format>
          <MaxLength>200</MaxLength>
          <Length>400</Length>
          <displaynames>
            <displayname description="Failed Action" languagecode="1033" />
          </displaynames>
        </attribute>
        <attribute PhysicalName="enmax_acdnFlowDisplayName">
          <Type>nvarchar</Type>
          <Name>enmax_acdnflowdisplayname</Name>
          <LogicalName>enmax_acdnflowdisplayname</LogicalName>
          <RequiredLevel>none</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <Format>text</Format>
          <MaxLength>300</MaxLength>
          <Length>600</Length>
          <displaynames>
            <displayname description="Flow Display Name" languagecode="1033" />
          </displaynames>
        </attribute>
        <attribute PhysicalName="enmax_acdnFlowRunId">
          <Type>nvarchar</Type>
          <Name>enmax_acdnflowrunid</Name>
          <LogicalName>enmax_acdnflowrunid</LogicalName>
          <RequiredLevel>none</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <Format>text</Format>
          <MaxLength>100</MaxLength>
          <Length>200</Length>
          <displaynames>
            <displayname description="Flow Run Id" languagecode="1033" />
          </displaynames>
        </attribute>
        <attribute PhysicalName="enmax_acdnFlowRunUrl">
          <Type>nvarchar</Type>
          <Name>enmax_acdnflowrunurl</Name>
          <LogicalName>enmax_acdnflowrunurl</LogicalName>
          <RequiredLevel>none</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <Format>url</Format>
          <MaxLength>500</MaxLength>
          <Length>1000</Length>
          <displaynames>
            <displayname description="Flow Run Url" languagecode="1033" />
          </displaynames>
        </attribute>
        <attribute PhysicalName="enmax_acdnAppArea">
          <Type>nvarchar</Type>
          <Name>enmax_acdnapparea</Name>
          <LogicalName>enmax_acdnapparea</LogicalName>
          <RequiredLevel>none</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <Format>text</Format>
          <MaxLength>200</MaxLength>
          <Length>400</Length>
          <displaynames>
            <displayname description="App Area" languagecode="1033" />
          </displaynames>
        </attribute>
        <attribute PhysicalName="enmax_acdnAppRoute">
          <Type>nvarchar</Type>
          <Name>enmax_acdnapproute</Name>
          <LogicalName>enmax_acdnapproute</LogicalName>
          <RequiredLevel>none</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <Format>text</Format>
          <MaxLength>500</MaxLength>
          <Length>1000</Length>
          <displaynames>
            <displayname description="App Route" languagecode="1033" />
          </displaynames>
        </attribute>
        <attribute PhysicalName="enmax_acdnCorrelationId">
          <Type>nvarchar</Type>
          <Name>enmax_acdncorrelationid</Name>
          <LogicalName>enmax_acdncorrelationid</LogicalName>
          <RequiredLevel>none</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <Format>text</Format>
          <MaxLength>100</MaxLength>
          <Length>200</Length>
          <displaynames>
            <displayname description="Correlation Id" languagecode="1033" />
          </displaynames>
        </attribute>
        <attribute PhysicalName="enmax_acdnSubjectTable">
          <Type>nvarchar</Type>
          <Name>enmax_acdnsubjecttable</Name>
          <LogicalName>enmax_acdnsubjecttable</LogicalName>
          <RequiredLevel>none</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <Format>text</Format>
          <MaxLength>100</MaxLength>
          <Length>200</Length>
          <displaynames>
            <displayname description="Subject Table" languagecode="1033" />
          </displaynames>
        </attribute>
        <attribute PhysicalName="enmax_acdnSubjectId">
          <Type>nvarchar</Type>
          <Name>enmax_acdnsubjectid</Name>
          <LogicalName>enmax_acdnsubjectid</LogicalName>
          <RequiredLevel>none</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <Format>text</Format>
          <MaxLength>100</MaxLength>
          <Length>200</Length>
          <displaynames>
            <displayname description="Subject Id" languagecode="1033" />
          </displaynames>
        </attribute>
        <attribute PhysicalName="enmax_acdnActingUser">
          <Type>lookup</Type>
          <Name>enmax_acdnactinguser</Name>
          <LogicalName>enmax_acdnactinguser</LogicalName>
          <RequiredLevel>none</RequiredLevel>
          <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>
          <ValidForUpdateApi>0</ValidForUpdateApi>
          <ValidForReadApi>1</ValidForReadApi>
          <ValidForCreateApi>1</ValidForCreateApi>
          <IsCustomField>1</IsCustomField>
          <IntroducedVersion>1.0.0.0</IntroducedVersion>
          <IsCustomizable>1</IsCustomizable>
          <LookupStyle>single</LookupStyle>
          <LookupTypes />
          <displaynames>
            <displayname description="Acting User" languagecode="1033" />
          </displaynames>
        </attribute>
"""


def _patch_entity_xml(text: str) -> str:
    text = text.replace(OLD, NEW)
    text = text.replace("Broadcast Dismissal", "Flow Exception")
    text = text.replace("Broadcast Dismissals", "Flow Exceptions")
    for attr in REMOVE_ATTRS:
        text = re.sub(
            rf"\s*<attribute PhysicalName=\"{attr}\">.*?</attribute>\s*",
            "\n",
            text,
            flags=re.DOTALL,
        )
    # Insert new attributes before primary key block.
    marker = f'<attribute PhysicalName="{NEW}Id">'
    if marker not in text:
        marker = f"<attribute PhysicalName=\"{NEW}Id\">"
    text = text.replace(marker, NEW_ATTRS_XML + "\n        " + marker, 1)
    # Widen primary name field.
    text = text.replace("<MaxLength>200</MaxLength>\n          <Length>400</Length>\n          <displaynames>\n            <displayname description=\"Name\"", "<MaxLength>300</MaxLength>\n          <Length>600</Length>\n          <displaynames>\n            <displayname description=\"Name\"", 1)
    return text


def _patch_relationship_files() -> None:
    rel_dir = REPO / "solution/src/Other/Relationships"
    for path in list(rel_dir.glob("*.xml")) + [REPO / "solution/src/Other/Relationships.xml"]:
        if not path.exists():
            continue
        raw = path.read_text(encoding="utf-8")
        if OLD not in raw:
            continue
        path.write_text(raw.replace(OLD, NEW), encoding="utf-8")


def main() -> int:
    if not ENTITY_XML.exists():
        raise SystemExit(f"Missing {ENTITY_XML}; copy template entity first.")

    ENTITY_XML.write_text(_patch_entity_xml(ENTITY_XML.read_text(encoding="utf-8")), encoding="utf-8")

    # Patch forms/saved queries labels only (GUIDs unchanged — acceptable for new entity).
    for path in ENTITY_DIR.rglob("*.xml"):
        if path.name == "Entity.xml":
            continue
        raw = path.read_text(encoding="utf-8")
        if OLD in raw or "Broadcast Dismissal" in raw:
            path.write_text(
                raw.replace(OLD, NEW).replace("Broadcast Dismissal", "Flow Exception"),
                encoding="utf-8",
            )

    _patch_relationship_files()
    print(f"Patched {ENTITY_XML}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

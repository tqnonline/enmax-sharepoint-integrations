/*!
 * Manual service for enmax_autocadflowexception (added before codegen refresh).
 */

import type {
  Enmax_autocadflowexceptionsBase,
  Enmax_autocadflowexceptions,
} from "../models/Enmax_autocadflowexceptionsModel";
import type { IOperationResult } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../../.power/schemas/appschemas/dataSourcesInfo";
import { getClient } from "@microsoft/power-apps/data";

export class Enmax_autocadflowexceptionsService {
  private static readonly dataSourceName = "enmax_autocadflowexceptions";
  private static readonly client = getClient(dataSourcesInfo);

  public static async create(
    record: Omit<Enmax_autocadflowexceptionsBase, never>,
  ): Promise<IOperationResult<Enmax_autocadflowexceptions>> {
    return Enmax_autocadflowexceptionsService.client.createRecordAsync(
      Enmax_autocadflowexceptionsService.dataSourceName,
      record,
    );
  }
}

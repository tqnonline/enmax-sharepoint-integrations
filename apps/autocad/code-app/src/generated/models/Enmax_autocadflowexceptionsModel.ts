/*!
 * Manual model for enmax_autocadflowexception (added before codegen refresh).
 */

export interface Enmax_autocadflowexceptionsBase {
  enmax_acdnname: string;
  enmax_acdnorigin: number;
  enmax_acdnseverity: number;
  enmax_acdnerrormessage: string;
  enmax_acdnerrorcode?: string;
  enmax_acdnerrordetail?: string;
  enmax_acdnfailedaction?: string;
  enmax_acdnflowdisplayname?: string;
  enmax_acdnflowrunid?: string;
  enmax_acdnflowrunurl?: string;
  enmax_acdnapparea?: string;
  enmax_acdnapproute?: string;
  enmax_acdncorrelationid?: string;
  enmax_acdnsubjecttable?: string;
  enmax_acdnsubjectid?: string;
  "enmax_acdnactinguser@odata.bind"?: string;
}

export interface Enmax_autocadflowexceptions extends Enmax_autocadflowexceptionsBase {
  enmax_autocadflowexceptionid: string;
}

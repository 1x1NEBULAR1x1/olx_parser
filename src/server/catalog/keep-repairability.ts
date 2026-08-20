export interface RepairabilitySnapshot {
  repairability_score: number | null;
  repairability_scale: number | null;
  ifixit_device_name: string | null;
  ifixit_url: string | null;
}

export interface IfixitLookupSnapshot {
  repairability_score: number | null;
  repairability_scale: number | null;
  device_name: string | null;
  device_url: string | null;
}

export function resolveRepairabilityOnEnrich(input: {
  previous: RepairabilitySnapshot;
  ifixit: IfixitLookupSnapshot | null;
  stub: { repairability_score: number; repairability_scale: number };
  stub_url: string;
}): RepairabilitySnapshot {
  const has_ifixit = input.ifixit !== null
    && (input.ifixit.repairability_score !== null || input.ifixit.device_name !== null);

  if (has_ifixit && input.ifixit) {
    return {
      repairability_score: input.ifixit.repairability_score,
      repairability_scale: input.ifixit.repairability_scale,
      ifixit_device_name: input.ifixit.device_name,
      ifixit_url: input.ifixit.device_url,
    };
  }

  if (input.previous.repairability_score !== null) {
    return input.previous;
  }

  return {
    repairability_score: input.stub.repairability_score,
    repairability_scale: input.stub.repairability_scale,
    ifixit_device_name: input.previous.ifixit_device_name,
    ifixit_url: input.stub_url,
  };
}

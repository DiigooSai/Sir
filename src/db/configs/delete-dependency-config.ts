interface Dependency {
  model: string; // The name of the related model
  field: string; // The field in the dependent model that references this model
}

export interface DependencyConfig {
  cascade?: Dependency[]; // Dependencies to be soft-deleted when the parent is deleted
  prevent?: Dependency[]; // Dependencies that prevent deletion if they exist
}

export const deleteDependencyConfig: Record<string, DependencyConfig> = {
  MODAL_NAME: {
    prevent: [{ model: 'AFFECTED_MODAL_NAME', field: 'reference_id>' }],
    cascade: [{ model: 'AFFECTED_MODAL_NAME', field: 'reference_id>' }],
  },
};

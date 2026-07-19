export const LABEL_PROTOTYPE_SCHEMA = 'simulatte.classificationLabelPrototype.v1';

export function classificationLabelPrototype(job, labelId) {
  const prototype = job && job.labelPrototype || {};
  if (prototype.schema !== LABEL_PROTOTYPE_SCHEMA) {
    throw new Error(`${job && job.id || 'classification head'} labelPrototype schema is required`);
  }
  const template = String(prototype.template || '');
  if (!template.includes('{label}')) {
    throw new Error(`${job.id} labelPrototype template must contain {label}`);
  }
  return template.replaceAll('{label}', String(labelId || '').replaceAll('-', ' '));
}

export function validateScenario(scenario) {
  const issues = [];
  if (!scenario || !Array.isArray(scenario.timeline) || scenario.timeline.length === 0) {
    issues.push({ level: 'error', message: 'Scenario timeline is empty.' });
    return issues;
  }

  scenario.timeline.forEach((stage, index) => {
    if (!stage.type) {
      issues.push({ level: 'error', message: `Stage ${index + 1} missing type.` });
    }
    if (stage.type === 'FOUNDING' && (!stage.params || !Array.isArray(stage.params.founders))) {
      issues.push({ level: 'warning', message: 'Founding stage missing founder allocation; defaults will be applied.' });
    }
  });

  return issues;
}

export const submissionEditorPermission = 'work_submission_editor';

export function storedPermissions(value: unknown): string[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch { return []; }
}

export function isSubmissionEditor(value: unknown) {
  return storedPermissions(value).includes(submissionEditorPermission);
}

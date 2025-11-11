import { prompt } from 'enquirer';

type YesNoOptions = {
  initial?: boolean;
  yesLabel?: string;
  noLabel?: string;
};

/**
 * Simplified wrapper around Enquirer to ask yes/no questions with clear labels.
 */
export async function promptYesNo(message: string, options: YesNoOptions = {}): Promise<boolean> {
  const { initial = true, yesLabel = 'Yes', noLabel = 'No' } = options;

  const result = await prompt<{ value: boolean }>({
    type: 'toggle',
    name: 'value',
    message,
    enabled: yesLabel,
    disabled: noLabel,
    initial,
  });

  return Boolean(result.value);
}


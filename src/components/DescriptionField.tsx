import { QuillEditor } from './QuillEditor';

interface DescriptionFieldProps {
  productId: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  textareaClassName?: string;
}

export function DescriptionField({
  productId,
  value,
  onChange,
  disabled = false,
  id = 'description',
  textareaClassName = '',
}: DescriptionFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-300">
        Description
      </label>
      <QuillEditor
        productId={productId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder="Describe your asset..."
        className={textareaClassName}
      />
    </div>
  );
}

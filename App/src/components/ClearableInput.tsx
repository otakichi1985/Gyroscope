import { CloseIcon } from "./icons";

interface ClearableInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onClear: () => void;
  clearLabel: string;
  wrapperClassName?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

export function ClearableInput({
  value,
  onClear,
  clearLabel,
  wrapperClassName = "",
  className = "",
  inputRef,
  ...rest
}: ClearableInputProps) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      <input ref={inputRef} value={value} className={`${className} pr-6`} {...rest} />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label={clearLabel}
          className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center rounded p-0.5 opacity-60 transition-colors duration-150 hover:opacity-100"
        >
          <CloseIcon className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

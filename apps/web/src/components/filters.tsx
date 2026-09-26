import { Search } from 'lucide-react';

/** Abas de filtro de situação (a primeira opção, "Todos", tem valor vazio). */
export function FilterTabs<Value extends string>(props: {
  label: string;
  value: Value | '';
  options: { value: Value | ''; label: string }[];
  onChange: (value: Value | '') => void;
}) {
  return (
    <div className="tabs" role="group" aria-label={props.label}>
      {props.options.map((option) => (
        <button
          key={option.value || 'todos'}
          type="button"
          className="tab"
          aria-pressed={props.value === option.value}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="search">
      <Search size={18} aria-hidden />
      <input
        type="search"
        placeholder={props.label}
        aria-label={props.label}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

import { MAX_ITEMS_PER_RMA } from '@central/contracts';
import { Plus } from 'lucide-react';
import { useId, useState } from 'react';

/**
 * Inclusão de equipamentos: um por vez ou vários de uma vez (chamados com
 * dezenas ou centenas de itens). Cada um continua com as suas fotos.
 */
export function AddItemsControl(props: {
  current: number;
  onAdd: (count: number) => void;
}) {
  const id = useId();
  const remaining = MAX_ITEMS_PER_RMA - props.current;
  const [count, setCount] = useState(1);
  const amount = Math.min(Math.max(count, 1), remaining);

  return (
    <div className="add-items">
      {remaining > 0 && (
        <div className="add-items-row">
          <div className="field add-items-count">
            <label htmlFor={id}>Quantidade</label>
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={remaining}
              value={count}
              onChange={(event) => setCount(Number(event.target.value) || 1)}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => props.onAdd(amount)}
          >
            <Plus size={18} aria-hidden />
            {amount === 1
              ? 'Adicionar equipamento'
              : `Adicionar ${amount} equipamentos`}
          </button>
        </div>
      )}
      <p className="muted" aria-live="polite">
        {props.current} de {MAX_ITEMS_PER_RMA} equipamentos neste atendimento.
      </p>
    </div>
  );
}

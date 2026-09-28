import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { Field, TextAreaField } from '../../../components/ui';
import type { FieldErrors } from '../../../lib/forms';
import type { DraftItem } from './draft';
import { PhotoField } from './PhotoField';

/** Um equipamento do formulário de abertura, com as ações de ordem e remoção. */
export function ItemFields(props: {
  item: DraftItem;
  index: number;
  total: number;
  errors: FieldErrors;
  onChange: (change: Partial<DraftItem>) => void;
  onAddPhotos: (files: File[]) => void;
  onRemovePhoto: (slotKey: string) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { item, index } = props;
  const path = (field: string) => `items.${index}.${field}`;
  const label = `equipamento ${index + 1}`;
  return (
    <fieldset>
      <legend>Equipamento {index + 1}</legend>
      <div className="item-toolbar">
        <button
          type="button"
          className="icon-button"
          aria-label={`Mover ${label} para cima`}
          disabled={index === 0}
          onClick={() => props.onMove(-1)}
        >
          <ArrowUp size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Mover ${label} para baixo`}
          disabled={index === props.total - 1}
          onClick={() => props.onMove(1)}
        >
          <ArrowDown size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Remover ${label}`}
          disabled={props.total === 1}
          onClick={props.onRemove}
        >
          <Trash2 size={18} aria-hidden />
        </button>
      </div>
      <div className="field-row">
        <Field
          label="Modelo"
          name={path('model')}
          value={item.model}
          onChange={(model) => props.onChange({ model })}
          errors={props.errors}
          maxLength={80}
          placeholder="Ex.: SpeedFace V5L"
        />
        <Field
          label="Número de série"
          name={path('serialNumber')}
          value={item.serialNumber}
          onChange={(serialNumber) => props.onChange({ serialNumber })}
          errors={props.errors}
          maxLength={60}
        />
      </div>
      <TextAreaField
        label="Falha apresentada"
        name={path('reportedFailure')}
        value={item.reportedFailure}
        onChange={(reportedFailure) => props.onChange({ reportedFailure })}
        errors={props.errors}
        maxLength={2000}
        hint="Descreva o que acontece e desde quando."
      />
      <TextAreaField
        label="Observações (opcional)"
        name={path('notes')}
        value={item.notes}
        onChange={(notes) => props.onChange({ notes })}
        errors={props.errors}
        rows={2}
        maxLength={1000}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={item.warrantyRequested}
          onChange={(e) =>
            props.onChange({ warrantyRequested: e.target.checked })
          }
        />
        Solicitar análise de garantia
      </label>
      <PhotoField
        itemLabel={label}
        photos={item.photos}
        error={props.errors[path('photoIds')]}
        onAdd={props.onAddPhotos}
        onRemove={props.onRemovePhoto}
      />
    </fieldset>
  );
}

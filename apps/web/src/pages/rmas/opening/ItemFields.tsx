import { PHOTOS_PER_ITEM, RMA_ITEM_TEXT_LIMITS } from '@central/contracts';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { memo } from 'react';
import { Field, TextAreaField } from '../../../components/ui';
import type { FieldErrors } from '../../../lib/forms';
import { MobileUploadButton } from '../MobileUploadButton';
import type { DraftItem } from './draft';
import type { OpeningActions } from './use-opening-draft';
import { PhotoField } from './PhotoField';
import { VideoField } from './VideoField';

/**
 * Um equipamento do formulário de abertura, com as ações de ordem e remoção.
 * Memorizado: com centenas de equipamentos, só o item alterado é redesenhado
 * (as ações são estáveis e cada item mantém a referência enquanto não muda).
 */
export const ItemFields = memo(function ItemFields(props: {
  item: DraftItem;
  index: number;
  total: number;
  errors: FieldErrors;
  actions: OpeningActions;
}) {
  const { item, index, actions } = props;
  const change = (values: Partial<DraftItem>) =>
    actions.updateItem(item.key, values);
  const path = (field: string) => `items.${index}.${field}`;
  const label = `equipamento ${index + 1}`;
  const photoLimit = PHOTOS_PER_ITEM.max - item.photos.length;
  const videoLimit = item.video ? 0 : 1;
  return (
    <fieldset>
      <legend>Equipamento {index + 1}</legend>
      <div className="item-toolbar">
        <button
          type="button"
          className="icon-button"
          aria-label={`Mover ${label} para cima`}
          disabled={index === 0}
          onClick={() => actions.move(index, -1)}
        >
          <ArrowUp size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Mover ${label} para baixo`}
          disabled={index === props.total - 1}
          onClick={() => actions.move(index, 1)}
        >
          <ArrowDown size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Remover ${label}`}
          disabled={props.total === 1}
          onClick={() => actions.removeItem(item.key)}
        >
          <Trash2 size={18} aria-hidden />
        </button>
      </div>
      <div className="field-row">
        <Field
          label="Modelo"
          name={path('model')}
          value={item.model}
          onChange={(model) => change({ model })}
          errors={props.errors}
          maxLength={RMA_ITEM_TEXT_LIMITS.model}
          placeholder="Ex.: SpeedFace V5L"
        />
        <Field
          label="Número de série"
          name={path('serialNumber')}
          value={item.serialNumber}
          onChange={(serialNumber) => change({ serialNumber })}
          errors={props.errors}
          maxLength={RMA_ITEM_TEXT_LIMITS.serialNumber}
        />
      </div>
      <TextAreaField
        label="Falha apresentada"
        name={path('reportedFailure')}
        value={item.reportedFailure}
        onChange={(reportedFailure) => change({ reportedFailure })}
        errors={props.errors}
        maxLength={RMA_ITEM_TEXT_LIMITS.reportedFailure}
        hint="Descreva o que acontece e desde quando."
      />
      <TextAreaField
        label="Observações (opcional)"
        name={path('notes')}
        value={item.notes}
        onChange={(notes) => change({ notes })}
        errors={props.errors}
        rows={2}
        maxLength={RMA_ITEM_TEXT_LIMITS.notes}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={item.warrantyRequested}
          onChange={(e) => change({ warrantyRequested: e.target.checked })}
        />
        Solicitar análise de garantia
      </label>
      <PhotoField
        itemLabel={label}
        photos={item.photos}
        error={props.errors[path('photoIds')]}
        onAdd={(files) => actions.addPhotos(item.key, files)}
        onRemove={(slotKey) => actions.removePhoto(item.key, slotKey)}
      />
      <VideoField
        itemLabel={label}
        video={item.video}
        error={props.errors[path('videoId')]}
        onSelect={(file) => actions.selectVideo(item.key, file)}
        onRemove={() => change({ video: null })}
      />
      {photoLimit + videoLimit > 0 && (
        <div className="field">
          <MobileUploadButton
            label="Enviar pelo celular"
            title={`Fotos e vídeo do equipamento ${index + 1}`}
            description="Tire as fotos e grave o vídeo da falha com o celular: os arquivos entram neste equipamento, sem passar por outro aplicativo."
            doneMessage="Envio concluído."
            request={{
              kind: 'abertura',
              label: `Equipamento ${index + 1}${item.model ? ` · ${item.model}` : ''}`,
              photoLimit,
              videoLimit,
            }}
            onFiles={(files) => actions.receiveFiles(item.key, files)}
          />
          <span className="hint">
            Use a câmera do celular pelo QR Code, sem login.
          </span>
        </div>
      )}
    </fieldset>
  );
});

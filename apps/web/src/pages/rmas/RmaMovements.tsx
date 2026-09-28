import {
  SHIPMENT_METHOD_RULES,
  type ReceiptView,
  type ShipmentView,
} from '@central/contracts';
import { PackageOpen, Truck, type LucideIcon } from 'lucide-react';
import { formatDateTime } from '../../lib/format';

type Actor = { name: string } | null | undefined;

interface Movement {
  id: string;
  at: string;
  icon: LucideIcon;
  title: string;
  details: (string | null)[];
  itemIds: string[];
}

function fromShipment(
  shipment: ShipmentView & { confirmedBy?: Actor },
): Movement {
  const method = SHIPMENT_METHOD_RULES[shipment.method].label;
  return {
    id: shipment.id,
    at: shipment.confirmedAt,
    icon: Truck,
    title: `Envio à fábrica · ${method}${shipment.carrier ? ` (${shipment.carrier})` : ''}`,
    details: [
      shipment.confirmedBy?.name ?? null,
      shipment.trackingCode ? `Rastreio ${shipment.trackingCode}` : null,
    ],
    itemIds: shipment.itemIds,
  };
}

function fromReceipt(receipt: ReceiptView & { receivedBy?: Actor }): Movement {
  return {
    id: receipt.id,
    at: receipt.receivedAt,
    icon: PackageOpen,
    title: 'Recebido na fábrica',
    details: [receipt.receivedBy?.name ?? null],
    itemIds: receipt.itemIds,
  };
}

/** Envios e recebimentos em ordem cronológica, com os itens de cada um (A5.2). */
export function RmaMovements(props: {
  shipments: (ShipmentView & { confirmedBy?: Actor })[];
  receipts: (ReceiptView & { receivedBy?: Actor })[];
  items: { id: string; model: string; serialNumber: string }[];
}) {
  const itemLabel = new Map(
    props.items.map((item) => [
      item.id,
      `${item.model} (S/N ${item.serialNumber})`,
    ]),
  );
  const movements = [
    ...props.shipments.map(fromShipment),
    ...props.receipts.map(fromReceipt),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <section className="card">
      <h2>Envio e recebimento</h2>
      {movements.length === 0 ? (
        <p className="muted">Nenhum envio ou recebimento registrado.</p>
      ) : (
        <ul className="timeline">
          {movements.map(({ id, at, icon: Icon, title, details, itemIds }) => (
            <li key={id}>
              <Icon size={18} aria-hidden />
              <div>
                <span className="strong">{title}</span>
                <span className="sub">
                  {[formatDateTime(at), ...details].filter(Boolean).join(' · ')}
                </span>
                <span className="sub">
                  {itemIds
                    .map((itemId) => itemLabel.get(itemId) ?? '—')
                    .join(', ')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** Margem branca mínima em volta do código, exigida pelos leitores. */
const QUIET_ZONE = 4;

/**
 * QR Code em SVG, desenhado módulo a módulo. As cores são fixas (escuro sobre
 * claro) nos dois temas: um código invertido não é lido por toda câmera.
 */
export function QrCode(props: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(props.value);
    code.make();
    const count = code.getModuleCount();
    const cells: string[] = [];
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (code.isDark(row, col)) {
          cells.push(`M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
        }
      }
    }
    return { size: count + QUIET_ZONE * 2, path: cells.join('') };
  }, [props.value]);

  return (
    <svg
      className="qr-code"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={props.label}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="var(--qr-light)" />
      <path d={path} fill="var(--qr-dark)" />
    </svg>
  );
}

/**
 * Envia um e-mail de teste com a configuração SMTP atual, direto, sem passar
 * pela fila de avisos. Serve para validar servidor, porta, TLS e senha antes
 * de ligar os avisos.
 * Uso: npm run mail:test -w @central/api -- destino@exemplo.com
 */
import { z } from 'zod';
import { loadEnvFile, parseEnv } from '../../config/env.js';
import { createSmtpTransport } from '../mail-transport.js';

loadEnvFile();
const env = parseEnv();

const recipient = z.email().safeParse(process.argv[2]);
if (!recipient.success) {
  console.error(
    'Informe o destinatário: npm run mail:test -w @central/api -- destino@exemplo.com',
  );
  process.exit(1);
}

const server = `${env.SMTP_HOST}:${env.SMTP_PORT}${env.SMTP_SECURE ? ' (TLS)' : ''}`;
const text = [
  'Este é um e-mail de teste da Central de Manutenção.',
  `Servidor: ${server}. Remetente: ${env.MAIL_FROM}.`,
  'Se chegou, os avisos por e-mail podem ser ligados.',
].join('\n');

try {
  await createSmtpTransport(env).send({
    to: recipient.data,
    subject: 'Teste de envio — Central de Manutenção',
    text,
    html: `<p>${text.replace(/\n/g, '</p><p>')}</p>`,
  });
  console.log(`E-mail de teste enviado para ${recipient.data} via ${server}.`);
} catch (error) {
  console.error(`Falha ao enviar pelo servidor ${server}: ${String(error)}`);
  process.exitCode = 1;
}

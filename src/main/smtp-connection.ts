import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import nodemailer from 'nodemailer';

import type {
  SendSingleEmailInput,
  SendSingleEmailResult,
  SenderAccount,
  TestConnectionInput,
  TestConnectionResult,
} from '../shared/types.js';

type SmtpAuthConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  useTls: boolean;
};

type SmtpErrorLike = Error & {
  code?: string;
  command?: string;
};

async function resolveSmtpHost(host: string): Promise<{
  connectionHost: string;
  tlsServername?: string;
}> {
  if (isIP(host) !== 0) {
    return { connectionHost: host };
  }

  try {
    const { address } = await lookup(host);
    return {
      connectionHost: address,
      tlsServername: host,
    };
  } catch {
    // Fallback to the original host so existing behavior remains available.
    return { connectionHost: host };
  }
}

async function createSmtpTransport(input: SmtpAuthConfig) {
  const secure = input.port === 465;
  const endpoint = await resolveSmtpHost(input.host);

  return nodemailer.createTransport({
    host: endpoint.connectionHost,
    port: input.port,
    secure,
    requireTLS: input.useTls,
    tls: endpoint.tlsServername
      ? { servername: endpoint.tlsServername }
      : undefined,
    auth: {
      user: input.username,
      pass: input.password,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
}

function formatSmtpError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'SMTP verify failed.';
  }

  const smtpError = error as SmtpErrorLike;

  if (smtpError.code === 'EAUTH') {
    return `${smtpError.message}（Gmail 请使用应用专用密码，不是登录密码）`;
  }

  if (smtpError.code === 'ETIMEDOUT' && smtpError.command === 'CONN') {
    return 'Connection timeout（SMTP 连通性超时，请检查网络或 DNS 设置）';
  }

  return smtpError.message;
}

export async function testSmtpConnection(
  input: TestConnectionInput,
): Promise<TestConnectionResult> {
  const startedAt = Date.now();
  const transporter = await createSmtpTransport(input);

  try {
    await transporter.verify();
    return {
      ok: true,
      message: `SMTP verify success (${Date.now() - startedAt}ms).`,
    };
  } catch (error) {
    return {
      ok: false,
      message: formatSmtpError(error),
    };
  } finally {
    transporter.close();
  }
}

export async function sendSingleEmail(
  account: SenderAccount,
  password: string,
  input: SendSingleEmailInput,
): Promise<SendSingleEmailResult> {
  const transporter = await createSmtpTransport({
    host: account.host,
    port: account.port,
    username: account.username,
    password,
    useTls: account.useTls,
  });

  try {
    const info = await transporter.sendMail({
      from: `"${account.name}" <${account.email}>`,
      to: input.to,
      subject: input.subject,
      text: input.body,
    });

    return {
      ok: true,
      messageId: info.messageId ?? null,
      acceptedCount: info.accepted.length,
      rejectedCount: info.rejected.length,
      response: typeof info.response === 'string' ? info.response : '',
    };
  } finally {
    transporter.close();
  }
}

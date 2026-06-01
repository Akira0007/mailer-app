import nodemailer from 'nodemailer';

import type {
  SendSingleEmailInput,
  SendSingleEmailResult,
  SenderAccount,
  TestConnectionInput,
  TestConnectionResult,
} from '../shared/types.js';

export async function testSmtpConnection(
  input: TestConnectionInput,
): Promise<TestConnectionResult> {
  const startedAt = Date.now();
  const secure = input.port === 465;

  const transporter = nodemailer.createTransport({
    host: input.host,
    port: input.port,
    secure,
    requireTLS: input.useTls,
    auth: {
      user: input.username,
      pass: input.password,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });

  try {
    await transporter.verify();
    return {
      ok: true,
      message: `SMTP verify success (${Date.now() - startedAt}ms).`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SMTP verify failed.';
    return {
      ok: false,
      message,
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
  const secure = account.port === 465;
  const transporter = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure,
    requireTLS: account.useTls,
    auth: {
      user: account.username,
      pass: password,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
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

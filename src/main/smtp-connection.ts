import nodemailer from 'nodemailer';

import type {
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

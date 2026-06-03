import type { CredentialStore } from './credential-store.js';
import { sendSingleEmail } from './smtp-connection.js';
import type { SendQueueRepository } from './send-queue-repository-sqlite.js';
import type { SmtpAccountsRepository } from './smtp-accounts-repository.js';
import type {
  SendQueueControlResult,
  SendQueueSummary,
} from '../shared/types.js';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown send error.';
}

function interruptibleSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new Error('aborted'));
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export class SendQueueRunner {
  private readonly queueRepo: SendQueueRepository;
  private readonly smtpRepo: SmtpAccountsRepository;
  private readonly credentialStore: CredentialStore;
  private loopRunning = false;
  private sleepController: AbortController | null = null;
  private accountCursor = 0;

  constructor(
    queueRepo: SendQueueRepository,
    smtpRepo: SmtpAccountsRepository,
    credentialStore: CredentialStore,
  ) {
    this.queueRepo = queueRepo;
    this.smtpRepo = smtpRepo;
    this.credentialStore = credentialStore;
  }

  bootstrap() {
    this.queueRepo.resetSendingToPending();
    if (!this.queueRepo.isPaused()) {
      this.ensureLoop();
    }
  }

  start(): SendQueueControlResult {
    this.queueRepo.setPaused(false);
    this.ensureLoop();
    return {
      ok: true,
      message: '队列已启动。',
      summary: this.queueRepo.getSummary(),
    };
  }

  pause(): SendQueueControlResult {
    this.queueRepo.setPaused(true);
    this.wakeLoop();
    return {
      ok: true,
      message: '队列已暂停。',
      summary: this.queueRepo.getSummary(),
    };
  }

  resume(): SendQueueControlResult {
    this.queueRepo.setPaused(false);
    this.ensureLoop();
    return {
      ok: true,
      message: '队列已恢复。',
      summary: this.queueRepo.getSummary(),
    };
  }

  summary(draftId?: string): SendQueueSummary {
    return this.queueRepo.getSummary(draftId);
  }

  private wakeLoop() {
    this.sleepController?.abort();
  }

  private ensureLoop() {
    if (this.loopRunning) {
      this.wakeLoop();
      return;
    }

    this.loopRunning = true;
    void this.runLoop().finally(() => {
      this.loopRunning = false;
    });
  }

  private async runLoop() {
    while (true) {
      if (this.queueRepo.isPaused()) {
        await this.sleep(1_000);
        continue;
      }

      const accounts = this.smtpRepo.list();
      if (accounts.length === 0) {
        await this.sleep(1_500);
        continue;
      }

      const nextAccountView = accounts[this.accountCursor % accounts.length];
      this.accountCursor = (this.accountCursor + 1) % accounts.length;
      const account = this.smtpRepo.findById(nextAccountView.id);
      if (!account) {
        await this.sleep(300);
        continue;
      }

      const claimedJob = this.queueRepo.claimNextPending(Date.now(), account.id);
      if (!claimedJob) {
        await this.sleep(800);
        continue;
      }

      try {
        const password = this.credentialStore.decrypt(account.encryptedPassword);
        const result = await sendSingleEmail(account, password, {
          accountId: account.id,
          to: claimedJob.to,
          subject: claimedJob.subject,
          body: claimedJob.body,
        });

        if (result.ok) {
          this.queueRepo.markSent(claimedJob.id, account.id, result);
        } else {
          this.queueRepo.markFailure(claimedJob.id, account.id, result.response || 'Send failed');
        }
      } catch (error) {
        this.queueRepo.markFailure(claimedJob.id, account.id, toErrorMessage(error));
      }
    }
  }

  private async sleep(ms: number) {
    const controller = new AbortController();
    this.sleepController = controller;
    try {
      await interruptibleSleep(ms, controller.signal);
    } catch {
      // ignore wake-up abort
    } finally {
      if (this.sleepController === controller) {
        this.sleepController = null;
      }
    }
  }
}

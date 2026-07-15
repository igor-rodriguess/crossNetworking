let drenando = false;

/** Informa ao balanceador que a instância não deve receber novo tráfego. */
export function iniciarDrenagem(): void {
  drenando = true;
}

export function estaDrenando(): boolean {
  return drenando;
}

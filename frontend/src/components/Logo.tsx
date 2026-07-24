// Marca CROSS — usa os PNGs oficiais do logo (assets/). A gema facetada em SVG
// permanece para usos pequenos: favicon, selos, diagrama e marcas d'água.

import logoPreto from '../assets/logo-cross.png';
import logoBranco from '../assets/logo-cross-branco.png';

export function SimboloCross({ tamanho = 26, cor = 'currentColor' }: { tamanho?: number; cor?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M11 3.5 L23.5 5.5 L29 15 L21.5 28 L7.5 26 L3 13.5 Z"
        stroke={cor}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M11 3.5 L14.5 14.5 M23.5 5.5 L14.5 14.5 M3 13.5 L14.5 14.5
           M14.5 14.5 L21.5 28 M14.5 14.5 L7.5 26
           M23.5 5.5 L20 15.5 M29 15 L20 15.5 M20 15.5 L21.5 28"
        stroke={cor}
        strokeWidth="1"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  );
}

export function LogoCross({
  claro = false,
  compacto = false,
  altura = 64,
}: {
  claro?: boolean;
  compacto?: boolean;
  altura?: number;
}) {
  if (compacto) {
    return <SimboloCross tamanho={26} cor={claro ? '#FFFFFF' : '#0A0A0B'} />;
  }
  return (
    // self-start + shrink-0: impede que contêineres flex estiquem o PNG e
    // distorçam a proporção (ex.: painel do login com align-items: stretch)
    <img
      src={claro ? logoBranco : logoPreto}
      alt="CROSS Networking"
      style={{ height: altura, width: 'auto' }}
      className="shrink-0 select-none self-start object-contain"
      draggable={false}
    />
  );
}

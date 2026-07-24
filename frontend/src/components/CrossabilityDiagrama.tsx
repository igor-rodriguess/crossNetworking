import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { RotuloMono } from './ui';

// Diagrama animado da metodologia Crossability, no estilo do material oficial
// da Cross: os perfis de CLIENTE e PARCEIRO — Objetivos, Ativos e Consumidores —
// se aproximam e, quando casam, DEU CROSS.

const TINTA = '#0A0A0B';
const OURO = '#B98E4A';
const OURO_ESCURO = '#8A6832';

const ROTULO_LADO = {
  fontFamily: 'Archivo, sans-serif',
  fontWeight: 700,
  fontSize: 16,
  fill: TINTA,
} as const;

const ROTULO_CENTRO = {
  fontFamily: 'Archivo, sans-serif',
  fontWeight: 800,
  fontSize: 19,
  letterSpacing: '0.1em',
  fill: OURO_ESCURO,
} as const;

// Nomes longos estouram o triângulo — encurta para caber no rótulo central.
function encurtar(nome: string, max = 18): string {
  const limpo = nome.trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo;
}

// Vértices dos triângulos (cantos com pontos dourados)
const VERTICES_ESQ: [number, number][] = [
  [70, 40],
  [70, 340],
  [500, 190],
];
const VERTICES_DIR: [number, number][] = [
  [830, 40],
  [830, 340],
  [400, 190],
];

const DIMENSOES_LEGENDA = [
  { titulo: 'Objetivos', descricao: 'Onde a marca quer chegar.' },
  { titulo: 'Ativos', descricao: 'Quais forças podem gerar valor.' },
  { titulo: 'Consumidores', descricao: 'Quem eu já tenho e quem eu quero impactar.' },
];

// Rótulos do cliente e do parceiro em análise. Sem nomes, cai no genérico
// CLIENTE/PARCEIRO (uso do diagrama fora do contexto de uma candidatura).
interface Props {
  nomeCliente?: string;
  nomeParceiro?: string;
}

export function CrossabilityDiagrama({ nomeCliente, nomeParceiro }: Props = {}) {
  const [rodada, setRodada] = useState(0);
  const rotuloCliente = nomeCliente ? encurtar(nomeCliente) : 'CLIENTE';
  const rotuloParceiro = nomeParceiro ? encurtar(nomeParceiro) : 'PARCEIRO';

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-cloud px-6 py-4">
        <RotuloMono>Metodologia Crossability — quando os perfis casam, deu Cross</RotuloMono>
        <button
          type="button"
          onClick={() => setRodada((r) => r + 1)}
          className="flex items-center gap-1.5 rounded-full border border-mist px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-stone transition-colors hover:border-graphite hover:text-ink"
        >
          <RotateCcw size={11} strokeWidth={1.5} /> Repetir
        </button>
      </div>

      <div className="p-4">
        <svg
          key={rodada}
          viewBox="0 0 900 380"
          className="mx-auto w-full max-w-3xl"
          role="img"
          aria-label="Metodologia Crossability: os perfis de cliente e parceiro se encontram e formam o Cross"
        >
          <defs>
            {/* Fundo champagne, como nos slides da metodologia */}
            <radialGradient id="fundoCross" cx="50%" cy="42%" r="75%">
              <stop offset="0%" stopColor="#FCF9F2" />
              <stop offset="55%" stopColor="#F7F1E3" />
              <stop offset="100%" stopColor="#F0E7D2" />
            </radialGradient>
            <filter id="sombraSelo" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="5" stdDeviation="9" floodColor="#0A0A0B" floodOpacity="0.22" />
            </filter>
          </defs>

          <rect x="0" y="0" width="900" height="380" rx="14" fill="url(#fundoCross)" />

          {/* Triângulo do CLIENTE */}
          <g className="cross-tri-esq">
            <polygon
              points="70,40 70,340 500,190"
              fill="#F5EEDF"
              fillOpacity="0.55"
              stroke={TINTA}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {VERTICES_ESQ.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" fill={OURO} stroke="#FFFFFF" strokeWidth="1.5" />
            ))}
            <text x={52} y={190} {...ROTULO_LADO} textAnchor="middle" transform="rotate(-90 52 190)">
              Objetivos
            </text>
            <text x={278} y={100} {...ROTULO_LADO} textAnchor="middle" transform="rotate(19.2 278 100)">
              Ativos
            </text>
            <text x={278} y={288} {...ROTULO_LADO} textAnchor="middle" transform="rotate(-19.2 278 288)">
              Consumidores
            </text>
            <text
              x={215}
              y={197}
              {...ROTULO_CENTRO}
              fontSize={nomeCliente ? 16 : 19}
              letterSpacing={nomeCliente ? '0.02em' : '0.1em'}
              textAnchor="middle"
            >
              {rotuloCliente}
            </text>
          </g>

          {/* Triângulo do PARCEIRO */}
          <g className="cross-tri-dir">
            <polygon
              points="830,40 830,340 400,190"
              fill="#FFFFFF"
              fillOpacity="0.65"
              stroke={TINTA}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {VERTICES_DIR.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" fill={OURO} stroke="#FFFFFF" strokeWidth="1.5" />
            ))}
            <text x={848} y={190} {...ROTULO_LADO} textAnchor="middle" transform="rotate(90 848 190)">
              Objetivos
            </text>
            <text x={622} y={100} {...ROTULO_LADO} textAnchor="middle" transform="rotate(-19.2 622 100)">
              Consumidores
            </text>
            <text x={622} y={288} {...ROTULO_LADO} textAnchor="middle" transform="rotate(19.2 622 288)">
              Ativos
            </text>
            <text
              x={685}
              y={197}
              {...ROTULO_CENTRO}
              fontSize={nomeParceiro ? 16 : 19}
              letterSpacing={nomeParceiro ? '0.02em' : '0.1em'}
              textAnchor="middle"
            >
              {rotuloParceiro}
            </text>
          </g>

          {/* Pulso dourado quando dá Cross */}
          <circle className="cross-pulso" cx="450" cy="190" r="52" fill="none" stroke={OURO} strokeWidth="3" />

          {/* Selo central: DEU CROSS */}
          <g className="cross-selo">
            <polygon
              points="450,116 522,190 450,264 378,190"
              fill="#FFFFFF"
              stroke={TINTA}
              strokeWidth="2.5"
              strokeLinejoin="round"
              filter="url(#sombraSelo)"
            />
            <polygon
              points="450,128 508,190 450,252 392,190"
              fill="none"
              stroke={OURO}
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <text
              x={450}
              y={197}
              textAnchor="middle"
              fontFamily="'Space Mono', monospace"
              fontWeight={700}
              fontSize={15}
              letterSpacing="0.08em"
              fill={TINTA}
            >
              DEU CROSS
            </text>
          </g>
        </svg>
      </div>

      {/* As três dimensões do perfil (material oficial) */}
      <div className="grid grid-cols-1 gap-4 border-t border-cloud px-6 py-4 sm:grid-cols-3">
        {DIMENSOES_LEGENDA.map((dim, idx) => (
          <div key={dim.titulo} className="flex items-baseline gap-2.5">
            <span className="font-mono text-[11px] tracking-[0.18em] text-accent">0{idx + 1}</span>
            <span>
              <span className="block text-sm font-bold text-ink">{dim.titulo}</span>
              <span className="block text-xs leading-relaxed text-stone">{dim.descricao}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

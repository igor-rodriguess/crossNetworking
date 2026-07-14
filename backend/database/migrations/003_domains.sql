-- =============================================================================
-- 003 – Tipos enumerados e domínios (WAD 7.3.3, 7.4.7, 7.4.13, 7.4.15)
-- Enums apenas para conjuntos extremamente estáveis; vocabulários sujeitos a
-- evolução usam tabelas de referência (004).
-- =============================================================================

CREATE TYPE tipo_parte AS ENUM ('organizacao', 'pessoa');

CREATE TYPE resposta_score_card AS ENUM ('sim', 'nao', 'nao_avaliado');

-- Estados de versão (WAD 7.3.8)
CREATE DOMAIN d_status_versao AS VARCHAR(30)
    CHECK (VALUE IN ('rascunho', 'em_revisao', 'vigente', 'substituida', 'cancelada'));

-- Padrões monetários e percentuais (WAD 7.3.22, 7.4.15)
CREATE DOMAIN d_moeda AS CHAR(3)
    CHECK (VALUE ~ '^[A-Z]{3}$');

CREATE DOMAIN d_valor_monetario AS NUMERIC(15,2)
    CHECK (VALUE >= 0);

CREATE DOMAIN d_percentual AS NUMERIC(7,4)
    CHECK (VALUE BETWEEN 0 AND 100);

-- Nível de confiança de dados estratégicos (0 a 1)
CREATE DOMAIN d_nivel_confianca AS NUMERIC(3,2)
    CHECK (VALUE BETWEEN 0 AND 1);

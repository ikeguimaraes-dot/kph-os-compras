# Atlas — V3

Experiência 3D exploratória em `/compras/atlas`, com laboratório local em `/lab/operacao`, criada com Three.js. Não substitui os painéis operacionais nem emite pedidos.

## Executar

```sh
npm install
npm run dev -- --hostname 127.0.0.1
```

Abra `http://127.0.0.1:3004/lab/operacao`.

A rota existe apenas em `NODE_ENV=development` e para host local. Em produção ou host diferente, retorna 404. O servidor deve escutar apenas na interface de loopback. Não foi criado bypass de autenticação nas rotas existentes.

## Dados

O arquivo privado `.local/twin-snapshot.json` é lido no servidor. Está ignorado pelo Git, fora de `public/`, e não contém credenciais. Seu formato está em `model.ts` (`TwinData`). Se não existir, a página apresenta a ausência do snapshot; não substitui números por dados inventados.

A leitura desta V1 foi extraída de `compras_automacao_execucao` e `compras_automacao_referencia_comercial`, somente por SELECT. Os totais por casa abrangem o cálculo completo; a exploração mostra 16 insumos por casa. A seleção da amostra não é ranking financeiro: grandezas de unidades diferentes não são comparáveis.

O cenário espacial, a localização ilustrativa por categoria, os móveis, pessoas, caminhões e percursos são conceituais. Não representam plantas, endereços de depósito, entregas ou telemetria real. A UI informa essa distinção. Os seis ambientes são conceituais e não representam seis depósitos cadastrados.

## Interações

- Grupo → casa → ambiente → insumo, por botões ou seleção na maquete.
- Arrastar para orbitar; roda do mouse e botões para zoom; reposicionar câmera.
- Camadas operação/estoque/fluxo, iluminação dia/noite, pausa de movimento e vista ampliada.
- Busca na amostra, médias por dia da semana e referências documentais do insumo.
- Horizonte de 0–7 dias, calculado na data local de São Paulo. Dias sem dado ou com menos de quatro amostras não geram previsão. A cobertura exige saldo não negativo, tecnicamente válido e recente na data da captura. A projeção não inclui novas entradas.
- Modal de ajuda com Escape e contenção de foco; botões HTML como alternativa à interação no canvas; redução de movimento respeitada.

## Verificação

TypeScript, ESLint, testes de projeção e validade do saldo. Conferência em Chrome local: navegação entre casas, seleção de insumo, notas, projeção disponível/insuficiente, camadas e iluminação. Nenhum deploy ou escrita no banco faz parte desta entrega.

## V2 — fornecedores, fábrica e participação das casas

O snapshot complementar `.local/atlas-network.json` (`TwinNetwork`) vem de SELECTs em `lorean_workdays`, `lorean_produtos_dia`, `compras_automacao_referencia_nota` e `everest_fornecedores`. Consultas de origem ficam no arquivo privado `.local/atlas-provenance.json`. Todos os arquivos `.local/` continuam fora do Git.

- Comparação das casas: mesmos dias para todas, excluindo dias suspeitos, sobreposição de dia inteiro/turnos, duplicação de turno e qualquer turno sem produtos. São dias observados não consecutivos dentro da janela informada, não a receita integral dessa janela.
- Receita é `receita_bruta` do Lorean; quantidade é soma de `lorean_produtos_dia.qtd`. Não é contagem de clientes, comandas ou faturamento contábil.
- As duas dimensões horizontais dos prédios usam a raiz quadrada da razão para a maior casa. Portanto a área do prédio, e não a dimensão linear, é proporcional à métrica escolhida. Altura e terrenos são ilustrativos. A escala igual não muda os números reais.
- Fornecedores: WEW e Guidara, mais os dois maiores KG entre os demais nas referências consultadas. Não representa uma lista completa nem um ranking misturando unidades. Agrupamento por raiz do CNPJ; KG, L e UNID continuam separados.
- “Relações nas notas” anima somente pares fornecedor–casa existentes nas notas, sem inferir rota física ou passagem pela fábrica.
- “Via fábrica · cenário” mostra recebimento, reserva, produção e expedição. Ainda não há vínculo de unidade ERP, ordens ou transferências da fábrica neste Atlas. Não são calculados saldos, capacidade, receita ou prazo para ela.
- Galpões, lavoura, esteira, veículos identificados e frequência dos deslocamentos são representação visual. O motivo agrícola do fornecedor de hortifruti não comprova propriedade de fazenda. Não há GPS, status de entrega ou telemetria.
- Clique em fornecedor/fábrica aproxima a câmera e filtra fluxos. Botões de velocidade, pausa, iluminação e retorno continuam disponíveis. A preferência de movimento reduzido impede o avanço das animações.

Verificação V2: testes de participação e conservação da proporção de área, TypeScript, ESLint e inspeção visual em Chrome. Sem deploy, migrations ou escrita no banco.

## V3 — vida nas casas e na cadeia

- Clientes sentados, pratos e copos, gestos de refeição, garçom com bandeja circulando, cozinheiros preparando alimentos, vapor nas panelas e bartender em atividade.
- Pessoas e carrinhos nas docas; equipe de produção na fábrica; volumes ilustrativos aparecem na carga/descarga dos caminhões. Pausa, velocidade e preferência de movimento reduzido controlam essas animações.
- Entrada pelo salão do Meet; navegação rápida entre casas e grupo, aproximação de ambientes e rótulos opcionais. Paletas, letreiros e decoração diferenciam as casas, sem afirmar fidelidade arquitetônica.
- Seletor de dia da semana usa o snapshot privado `.local/atlas-activity.json` (`TwinActivity`), com consulta SELECT de origem preservada nesse arquivo. A consulta não é enviada ao cliente.
- Fonte: `lorean_workdays.clientes`, agregada por casa e dia antes da média por dia da semana, na janela exibida. Exclui dias suspeitos, sobreposição de dia inteiro/turnos, turnos duplicados e registros sem clientes válidos. Um dia registrado pode conter apenas os turnos disponíveis; não equivale automaticamente a um dia completo. Dias ausentes não viram zero nem determinam fechamento.
- Média exibida apenas com quatro ou mais dias observados. O movimento usa a razão para a maior média confiável da própria casa. Entre 4 e 16 personagens simbólicos representam intensidade; zero observado exibe zero clientes e falta de amostra mantém oito personagens ilustrativos, com aviso explícito. Não representa lotação, presença em tempo real ou escala de funcionários.
- Os snapshots são locais e não se atualizam automaticamente. A V3 não modifica bases, pedidos, alertas 85/86 ou qualquer estado operacional.

Verificação V3: oito testes de modelo (incluindo amostras insuficientes, zeros e normalização por casa), TypeScript, ESLint e conferência visual no Chrome local. Sem deploy ou escrita no banco.

## Publicação da V3

A rota `/compras/atlas` usa o layout autenticado de Compras e verifica novamente sessão e autorização por casa com `comprasAccess`. O item **Atlas** aparece em **Visão & direção**, no menu desktop e móvel. Não usa `basePath`.

A captura aprovada é armazenada em `ATLAS_SNAPSHOT_GZIP`, variável privada de produção na Vercel (gzip/base64). Não é `NEXT_PUBLIC`, não é arquivo público e não é commitada. Não há atualização automática: a data da captura permanece explícita. O servidor decodifica e filtra as casas, vendas, atividade e fornecedores antes de enviar o resultado ao navegador. Em acesso parcial, recalcula totais documentados por casa e omite totais de unidades de medida disponíveis apenas para o grupo.

Para preparar uma nova captura aprovada, mantendo os arquivos privados em `.local/`:

```sh
node scripts/atlas-package-snapshot.mjs .local/atlas-production.b64
```

Configure o conteúdo desse arquivo como segredo `ATLAS_SNAPSHOT_GZIP` no projeto correto e faça novo deploy. Ausência de configuração mostra indisponibilidade, nunca dados fictícios. O laboratório continua bloqueado em produção. Não há migrations nem gravações no banco.

Validação de publicação: onze testes de modelo/escopo, TypeScript, ESLint e build de produção. Os testes de escopo incluem acesso vazio, acesso a uma casa e acesso integral.

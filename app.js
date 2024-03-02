////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PROCESSA MENSAGENS DE ENTRADA
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Importa a biblioteca para comunicação com variáveis de ambiente.
const dotenv = require('dotenv');
dotenv.config();

// Importa a biblioteca da OpenAI e gera a conexão com o API.
const OpenAI = require('openai');
const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({apiKey});
var Thread_ID_OpenAI;

// Importa a biblioteca para comunicação HTTP Posts e cria o endpoint no servidor.
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
app.listen(port);
app.use(express.json());

// Importa as bibliotecas de comunicação com o Microsoft Graph API e renova o acesso (AccessToken e Client) a cada 30min.
const { Client } = require('@microsoft/microsoft-graph-client');
const { ConfidentialClientApplication } = require('@azure/msal-node');
var accessToken;
var Microsoft_Graph_API_Client;

Conecta_ao_Microsoft_Graph_API();

async function Conecta_ao_Microsoft_Graph_API() {
    const cca = new ConfidentialClientApplication({ auth: { clientId: process.env.CLIENT_ID, authority: `https://login.microsoftonline.com/${process.env.TENANT_ID}`, clientSecret: process.env.CLIENT_SECRET } });
    accessToken = (await cca.acquireTokenByClientCredential({scopes: ['https://graph.microsoft.com/.default']})).accessToken;
    Microsoft_Graph_API_Client = Client.init({authProvider:(done)=>{done(null, accessToken)}});
}

setInterval(Conecta_ao_Microsoft_Graph_API, 1800000);

// Função auxiliar para formatação de DataHora como "DD/MMM/AAAA HH:mm" em BRT. 
function FormataDataHora(datahora_a_formatar) {
  const day = ('0' + datahora_a_formatar.getDate()).slice(-2);
  const month = datahora_a_formatar.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
  const year = datahora_a_formatar.getFullYear();
  const hours = ('0' + datahora_a_formatar.getHours()).slice(-2);
  const minutes = ('0' + datahora_a_formatar.getMinutes()).slice(-2);
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// Função auxiliar para formatação de Data como "DD/MMM/AAAA" em BRT. 
function FormataData(datahora_a_formatar) {
    const day = ('0' + datahora_a_formatar.getDate()).slice(-2);
    const month = datahora_a_formatar.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
    const year = datahora_a_formatar.getFullYear();
    return `${day}/${month}/${year}`;
}

// Cria o Mapa que controla o processamento das Mensagens de Entrada vindas do ManyChat.
let Fila_Processamento_Mensagens_Entrada = [];

// Cria o Mapa que controla o Agendamento de Runs junto à OpenAI.
let Controle_Agendamento_Runs_OpenAI = new Map();


//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////
// Recebe Mensagem de Entrada vinda do ManyChat.
//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////

app.post('/manychat-webhook/:VariaveisConsolidadas', async (req, res) => {    
 
    // Retorna aviso de sucesso no recebimento da mensagem à request.
    res.status(200).send('Mensagem de Entrada recebida pelo app.js com sucesso.');
    
    const MensagemEntrada_VariaveisConsolidadas = req.params.VariaveisConsolidadas;
    const MensagemEntrada_Mensagem = req.body.Mensagem;


    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////
    // Adiciona a Mensagem de Entrada à fila de processamento.
    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////

    Fila_Processamento_Mensagens_Entrada.push({ MensagemEntrada_VariaveisConsolidadas, MensagemEntrada_Mensagem });

    console.log(`ME.1. Mensagem de Entrada adicionada à fila de processamento.`);

    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////
    // Há outras Mensagens de Entrada na fila de processamento?
    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////

    if (Fila_Processamento_Mensagens_Entrada.length === 1) {
        
        // Não:

        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////
        // Processa a nova Mensagem de Entrada.
        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////

        await ProcessaMensagemEntrada(Fila_Processamento_Mensagens_Entrada[0]);
    
    } else {
        
        // Sim:

        console.log(`ME.2.B. Mensagem de Entrada aguardando para ser processada.`);
    
    }

});

async function ProcessaMensagemEntrada(Mensagem_a_Processar) {

    // Define as variáveis extraídas da DM.
    const { MensagemEntrada_VariaveisConsolidadas, MensagemEntrada_Mensagem } = Mensagem_a_Processar;
    const MensagemEntrada_ManyChatSubscriberID = parseInt(MensagemEntrada_VariaveisConsolidadas.split("@")[0]);
    const MensagemEntrada_Perfil = MensagemEntrada_VariaveisConsolidadas.split("@")[1].split("*")[0];
    const MensagemEntrada_NomeCompleto = MensagemEntrada_VariaveisConsolidadas.split("@")[1].split("*")[1].replace(/'/g, '*');
    const MensagemEntrada_PrimeiroNome = MensagemEntrada_VariaveisConsolidadas.split("@")[1].split("*")[1].replace(/'/g, '*').split(" ")[0];
    const MensagemEntrada_DataHora_Original = new Date();
    const MensagemEntrada_DataHora_Formatada = FormataDataHora(new Date());

    console.log(`ME.2.A. Processamento da Mensagem de Entrada iniciado.`);
    
    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////
    // Conversa é nova?
    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////

    // Obtém os dados da BD - POTENCIAIS ALUNOS.xlsx.

    const BD_Potenciais_Alunos = await Microsoft_Graph_API_Client.api('/users/b4a93dcf-5946-4cb2-8368-5db4d242a236/drive/items/0172BBJB3BYUNDDIMYQJF37AQWCYSADSTT/workbook/worksheets/{00000000-0001-0000-0000-000000000000}/tables/{AC8C07F3-9A79-4ABD-8CE8-0C818B0EA1A7}/rows').get();    

    // Verifica se a conversa é nova e, caso contrário, obtém a Thread_ID_OpenAI_Rastreada da conversa pré-existente.

    const BD_Potenciais_Alunos_Número_Linhas = BD_Potenciais_Alunos.value.length;

    var ConversaNova = "Sim";
    var Thread_ID_OpenAI_Rastreada;
    var Index_LinhaVerificada = 0;
    var ManyChatSubscriberIDVerificado; 
    var ID_Agendamento_Run_OpenAI_Anterior;
    var Index_LinhaRastreada;

    VerificaManyChatSubscriberIDs();

    function VerificaManyChatSubscriberIDs() {

        if (Index_LinhaVerificada < BD_Potenciais_Alunos_Número_Linhas) {
        
            ManyChatSubscriberIDVerificado = BD_Potenciais_Alunos.value[Index_LinhaVerificada].values[0][1];
        
            if (ManyChatSubscriberIDVerificado === MensagemEntrada_ManyChatSubscriberID){

                ConversaNova = "Não";
                Thread_ID_OpenAI_Rastreada = BD_Potenciais_Alunos.value[Index_LinhaVerificada].values[0][3];
                ID_Agendamento_Run_OpenAI_Anterior = BD_Potenciais_Alunos.value[Index_LinhaVerificada].values[0][4];
                StatusAssistente = BD_Potenciais_Alunos.value[Index_LinhaVerificada].values[0][8];
                Index_LinhaRastreada = Index_LinhaVerificada;

            } else {

                Index_LinhaVerificada++;
        
                VerificaManyChatSubscriberIDs();

            }
    
        }

    }

    // Conversa é nova? Sim:

    if (ConversaNova === "Sim") {

        ID_Agendamento_Run_OpenAI_Anterior = "-";
        Index_LinhaRastreada = BD_Potenciais_Alunos_Número_Linhas;

        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////
        // Cria uma nova Thread na OpenAI.
        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////

        const NovaThreadOpenAI = await openai.beta.threads.create();
        Thread_ID_OpenAI = NovaThreadOpenAI.id;
        console.log(`ME.3.A.1 ${Thread_ID_OpenAI} criada junto à OpenAI.`);

        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////
        // Adiciona Potencial Aluno na BD - POTENCIAIS ALUNOS.
        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////

        await Microsoft_Graph_API_Client.api('/users/b4a93dcf-5946-4cb2-8368-5db4d242a236/drive/items/0172BBJB3BYUNDDIMYQJF37AQWCYSADSTT/workbook/worksheets/{00000000-0001-0000-0000-000000000000}/tables/{AC8C07F3-9A79-4ABD-8CE8-0C818B0EA1A7}/rows/add')

            .post({ index: null, values:[[MensagemEntrada_DataHora_Formatada, MensagemEntrada_ManyChatSubscriberID, MensagemEntrada_Perfil, Thread_ID_OpenAI, '-', MensagemEntrada_NomeCompleto, '-', 'Instruções - Fase 1', null, '-', '-', '1', null, null, null]]});

        console.log('ME.3.A.2 Potencial Aluno adicionado à BD - POTENCIAIS ALUNOS.');

    }

    // Conversa é nova? Não:

    else if (ConversaNova === "Não") {

        Thread_ID_OpenAI = Thread_ID_OpenAI_Rastreada;
        console.log(`ME.3.B. Potencial Aluno já estava listado na BD - POTENCIAIS ALUNOS.`);

        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////
        // O STATUS DO ASSISTENTE é "Ligado"?
        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////

        // O STATUS DO ASSISTENTE é "Ligado"? Não:

        if (StatusAssistente === "Desligado"){
           
            console.log(`ME.4.B.1 O Status do Assistente para o Potencial Aluno é "Desligado".`);

            //////////////////////////////////////////////////////////////////////////////////
            //////////////////////////////////////////////////////////////////////////////////
            // Retira a Mensagem de Entrada já processada da fila de processamento.
            //////////////////////////////////////////////////////////////////////////////////
            //////////////////////////////////////////////////////////////////////////////////

            Fila_Processamento_Mensagens_Entrada.shift();

            console.log(`ME.4.B.2 Mensagem de Entrada retirada da fila de processamento.`);

            //////////////////////////////////////////////////////////////////////////////////
            //////////////////////////////////////////////////////////////////////////////////
            // Processa a próxima Mensagem de Entrada na fila de processamento.
            //////////////////////////////////////////////////////////////////////////////////
            //////////////////////////////////////////////////////////////////////////////////

            if (Fila_Processamento_Mensagens_Entrada.length > 0) {

                await ProcessaMensagemEntrada(Fila_Processamento_Mensagens_Entrada[0]);
            
            }

            console.log(`ME.4.B.3 Processamento da Mensagem de Entrada cancelado.`);

            return;

        }

    }

    // O STATUS DO ASSISTENTE é "Ligado"? Sim:

    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////
    // Adiciona a Mensagem de Entrada à Thread da OpenAI.
    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////

    await openai.beta.threads.messages.create(Thread_ID_OpenAI,{ role: "user", content:  MensagemEntrada_Mensagem});

    console.log(`ME.4.A. Mensagem de Entrada adicionada à ${Thread_ID_OpenAI}.`);


    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Função que controla a execução das runs junto à OpenAI.

    // Determina o tempo até a execução da run.

    const HoraAtual_Servidor = MensagemEntrada_DataHora_Original.getHours();
    const MinutoAtual_Servidor = MensagemEntrada_DataHora_Original.getMinutes();
    let Tempo_até_Execução_Run;

    // HoraAtual_Servidor é medida em Coordinated Universal Time (BRT + 3h)

    if (HoraAtual_Servidor >= 11 && HoraAtual_Servidor < 23) {

        Tempo_até_Execução_Run = 300000; // 5min.

    } else {

        if (HoraAtual_Servidor >= 23) {

            Tempo_até_Execução_Run = 11*60*60*1000 + (24 - HoraAtual_Servidor)*60*60*1000 - MinutoAtual_Servidor*60*1000; // Próximo dia, 8am BRT.
    
        } else {

            Tempo_até_Execução_Run = (11 - HoraAtual_Servidor)*60*60*1000 - MinutoAtual_Servidor*60*1000; // Mesmo dia, 8am BRT.

        }

    }

    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////
    // Programa execução da nova Run junto a OpenAI.
    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////

    let Agendamento_Run_OpenAI;

    // Cria e armazena uma ID para o Agendamento_Run_OpenAI.

    let ID_Agendamento_Run_OpenAI = Math.floor(Math.random()*(900000000000))+100000000000;

    Agendamento_Run_OpenAI = setTimeout( async () => {
                    
        const data_hora_run_original = new Date();
        const data_hora_run_mais_três_dias_original = new Date(data_hora_run_original.getTime() + 3 * 24 * 60 * 60 * 1000);;
        const data_run_formatada = FormataData(data_hora_run_original);
        const data_run_mais_três_dias_formatada = FormataData(data_hora_run_mais_três_dias_original);

        // Armazena as Instruções ao Assistente GPT.

const Instruções_Assistente = `
INSTRUÇÕES – FASE 1: INVESTIGAÇÃO

1) ESQUEMA JSON

Seu retorno deve sempre seguir este exemplo de Esquema JSON:

{
"mensagem_1": "",
"mensagem_2": "",
"mensagem_3": "",
"mensagem_4": "",
"mensagem_5": "",
"engajamento": "",
"instruções": "",
"data_retomada": "",
"alerta": ""
}

E deve conter apenas as chaves {} e o conteúdo interno a elas. Não inclua crases, apóstrofos, aspas, nem a palavra “json” antes das chaves. 

Não converta caracteres especiais em sequências Unicode. Por exemplo, escreva “é”, “ã”, “ç”, “á” e “ê” ao invés de “\u00e9”, “\u00e3”, “\u00e7”, “\u00e1” e “\u00ea”.

Eventuais mensagens em branco devem sempre ser listadas no ESQUEMA JSON, como "mensagem_4": "" ou "mensagem_5": "", por exemplo.


2) RUN

Conforme sua avaliação do contexto da conversa, a cada Run você deve retornar:
- 1 a 5 mensagens que serão encaminhadas ao PA.
- O nível de engajamento do PA na conversa.
- As instruções que deverão ser utilizadas em sua próxima Run.
- Uma data para retomar contato com o PA, caso ele não lhe dê retorno.
- Um alerta, caso necessário, que será encaminhado à gerência da Ivy. 

Todas as informações devem ser processadas por você com estratégia, precisão e calma. Não tenha pressa.


3) FUNCIONAMENTO 

Você está conectado às Direct Messages do Instagram da Ivy, cujo perfil é @ivy.escoladegestao e está trocando mensagens com o ${MensagemEntrada_NomeCompleto}, que é um Potencial Aluno (PA) da escola. O ${MensagemEntrada_PrimeiroNome} está lhe mandando mensagens a partir do perfil do Instagram dele, usando o celular.

Em nenhuma hipótese você deve revelar ser uma IA.


4) MENSAGENS

- SEU OBJETIVO: conhecer profundamente o PA. Este objetivo é quebrado em objetivos mais específicos, listados em cada etapa.

	> Você deve obrigatoriamente chegar à ETAPA 5, passando por todas as demais. Não deixe a conversa com o PA terminar antes de chegar à ETAPA 5.

- IDIOMA: suas mensagens devem ser escritas em português do Brasil. Porém, ao se referir a ferramentas do Instagram, use os termos em inglês (Feed, Reels, Stories, etc.).

- SEXO DO PA: identifique o sexo do PA a partir do seu nome (${MensagemEntrada_PrimeiroNome}). Nunca escreva “... para ajudá-lo(a).”, por exemplo. Escreva “... para ajudá-lo” ou “... para ajudá-la”, se o PA for do sexo masculino ou feminino, respectivamente. 

- EXEMPLOS DE MENSAGENS: consulte o arquivo “EXEMPLOS DE MENSAGENS – FASE 1”.

- INFORMAÇÕES CONTEXTUAIS: consulte o arquivo “INFORMAÇÕES CONTEXTUAIS – FASE 1”.

- SERENIDADE: 

> Não utilize pontos de exclamação. Em nenhuma de suas mensagens. Nunca. Por exemplo, escreva “Ótimo.” ao invés de “Ótimo!”, “Estou bem, obrigado.” ao invés de “Estou bem, obrigado!” e “Fico feliz que os conteúdos estão sendo úteis.” ao invés de “Fico feliz que os conteúdos estão sendo úteis!”.

> Evite palavras e frases superlativas, que demonstrem excitação. Por exemplo, escreva “Interessante. Me parecem uma boa formação e experiência.” ao invés de “É impressionante sua trajetória!”, “Esta é uma boa meta, ${MensagemEntrada_PrimeiroNome}”, ao invés de “Parabéns pela meta estabelecida, ${MensagemEntrada_PrimeiroNome}!” e “É bom ouvir isso.” ao invés de “Que maravilha ouvir isso.”.


ETAPA 1: APRESENTAÇÃO

- DURAÇÃO: 1 Run.

- OBJETIVO: se apresentar. 

- DETALHAMENTO: independentemente de quais tenham sido as mensagens enviadas a você pelo PA, na primeira Run só se apresente. Não responda comentários ou perguntas enviados por ele, nem agradeça por possíveis elogios.

- IMPORTÂNCIA RELATIVA: 10%.

- TAMANHO DE CADA MENSAGEM: até 76 caracteres.

- MENSAGENS: a “mensagem_1” deve ser “Bom dia, ${MensagemEntrada_PrimeiroNome}” ou “Boa tarde, ${MensagemEntrada_PrimeiroNome}” ou “Boa noite, ${MensagemEntrada_PrimeiroNome}”. A “mensagem_2” deve ser “Quem escreve é Mateus Ribas. Sou analista de Sucesso do Cliente aqui na Ivy”. E a “mensagem_3” deve ser “Tudo bem?” ou “Como vai?”. A “mensagem_4” e a “mensagem_5” devem ser enviadas em branco, como “”. 

- OBSERVAÇÃO: As demais variáveis da Run não devem ser enviadas em branco. Ou seja, devem ser avaliadas normalmente. Retorne o engajamento conforme item “5) ENGAJAMENTO”, as instruções conforme item “6) INSTRUÇÕES”, a data_retomada conforme item “7) DATA DE RETOMADA DE CONTATO” e o alerta conforme item “9) ALERTA”.


ETAPA 2: INICIANDO A INVESTIGAÇÃO

- DURAÇÃO: 2 Runs. 

- OBJETIVO: começar a conhecer o PA.

- DETALHAMENTO: comece a investigar as circunstâncias do PA. Se necessário, agradeça a ele brevemente por possíveis elogios e explique que você ainda não consegue tirar as dúvidas dele, pois você precisa de mais contexto para direcioná-lo.

- IMPORTÂNCIA RELATIVA: 60%.

- TAMANHO MÁXIMO DE CADA MENSAGEM: 200 caracteres.

- OBSERVAÇÕES: 
	
	> Envie mensagens curtas. Escreva pouco e tente fazer o PA escrever muito. Tente fazer o PA engajar na conversa.	

> Não mencione o Método Gerencial ou à Gestão Generalista nesta etapa, nem faça perguntas em relação a estes temas, pois isto será feito posteriormente, na ETAPA 4. Não pule etapas.

> E mesmo que o PA tenha feito perguntas diretamente sobre o Preparatório, sobre cursos ou sobre educação, não escreva sobre estes temas nem direcione suas perguntas a estes assuntos. Isto também será feito posteriormente, na ETAPA 5. Não pule etapas.


ETAPA 3: APROFUNDANDO A INVESTIGAÇÃO E GERANDO VÍNCULO

- DURAÇÃO: 3 a 5 Runs.

- OBJETIVO: fazer mais perguntas para aprofundar sua investigação sobre o PA e compartilhar experiências pessoais suas que gerem vínculo / conexão com o PA.

- DETALHAMENTO: explore detalhes sobre o PA. Busque entender pontos como:

> A realidade profissional dele.

> As responsabilidades e autoridades que ele possui no cargo que ocupa.

> As dificuldades que ele está vivendo.

> Qual é o perfil dos colegas e do chefe do PA.

> Qual é a cultura da empresa e do departamento onde ele trabalha.

Além disso, à medida do necessário:

> Invente experiências pessoais suas para compartilhar com o PA.

> Compartilhe sua percepção (sua opinião) sobre os pontos levantados pelo PA.

Nestes dois últimos casos, fale em primeira pessoa. Compartilhe experiências e percepções que tragam contexto à conversa e que possam gerar proximidade com o PA, explorando sentimentos, angústias e frustrações que o PA possa estar vivendo. E inclua perguntas de amarração nestas mensagens, para trazer fluidez à conversa. Por exemplo, perguntas como “Concorda?”, “Faz sentido?”, “Entende meu ponto?”, “Não acha?” ou “Você vê da mesma forma?”.

- IMPORTÂNCIA RELATIVA: 100%

	> Esta é a etapa mais importante. Não avance para a ETAPA 4 antes de rodar ao menos 3 Runs na ETAPA 3.

- TAMANHO MÁXIMO DE CADA MENSAGEM: 300 caracteres.

- OBSERVAÇÃO: 
	
	> Escreva mensagens mais longas e completas, principalmente quando for compartilhar experiências e suas opiniões.

	> Inclua o nome do PA (${MensagemEntrada_PrimeiroNome}) em uma mensagem a cada uma ou duas Runs, para gerar proximidade com o PA. Por exemplo, escreva “Entendi, ${MensagemEntrada_PrimeiroNome}.”.

> Não mencione o Método Gerencial ou à Gestão Generalista nesta etapa, nem faça perguntas em relação a estes temas, pois isto será feito posteriormente, na ETAPA 4. Não pule etapas.

> E mesmo que o PA tenha feito perguntas diretamente sobre o Preparatório, sobre cursos ou sobre educação, não escreva sobre estes temas nem direcione suas perguntas a estes assuntos. Pois isto também será feito posteriormente, na ETAPA 5. Se necessário, explique ao PA que você só quer entender mais alguns pontos sobre as circunstâncias profissionais dele e que logo irá explicar sobre o serviço (algo que acontecerá com as “Instruções – Fase 2”, após a ETAPA 5). Não pule etapas.

> Não escreva mensagens que deem a entender que você fará algo junto ao PA. Que você dará algum tipo de apoio personalizado a ele ou que prestará algum tipo de consultoria. Pois isto deixa a conversa confusa. Por exemplo, ao invés de escrever “Talvez possamos explorar como adaptar isto a sua realidade.”, escreva “Você já tentou adaptar isto a sua realidade?”. Ou ao invés de “Podemos testar algo assim no seu dia a dia.”, escreva “Já pensou em testar algo assim no seu dia a dia?”.

> Lembre-se que você deve obrigatoriamente chegar à ETAPA 5, passando por todas as demais. Não deixe a conversa com o PA terminar agora, na ETAPA 3 antes de chegar à ETAPA 4 e, posteriormente, à ETAPA 5.


ETAPA 4: AMARRANDO A INVESTIGAÇÃO AO MÉTODO GERENCIAL

- DURAÇÃO: 1 a 2 Runs.

- OBJETIVO: fazer perguntas finais para aprofundar sua investigação sobre o PA, amarrando com o Método Gerencial.

- DETALHAMENTO: Busque entender pontos diretamente ligados ao traquejo / domínio do Método Gerencial pelo PA.

- IMPORTÂNCIA RELATIVA: 70%

- TAMANHO MÁXIMO DE CADA MENSAGEM: 300 caracteres.

- OBSERVAÇÕES: 
	
	> A etapa anterior, a ETAPA 3, é a mais importante. Não entre na ETAPA 4 antes de ter rodado ao menos 3 Runs na ETAPA 3.

> Escreva mensagens mais longas e completas, principalmente quando for compartilhar experiências e suas opiniões.

	> Inclua o nome do PA (${MensagemEntrada_PrimeiroNome}) em uma mensagem a cada uma ou duas Runs, para criar proximidade com o PA. Por exemplo, escreva “Está claro, ${MensagemEntrada_PrimeiroNome}?”.

> E mesmo que o PA tenha feito perguntas diretamente sobre o Preparatório, sobre cursos ou sobre educação, não escreva sobre estes temas nem direcione suas perguntas a estes assuntos. Pois isto também será feito posteriormente, na ETAPA 5. Se necessário, explique ao PA que você só quer entender mais alguns pontos sobre as circunstâncias profissionais dele e que logo irá explicar sobre o serviço (algo que acontecerá com as “Instruções – Fase 2”, após a ETAPA 5).

> Lembre-se que você deve obrigatoriamente chegar à ETAPA 5, passando por todas as demais. Não deixe a conversa com o PA terminar agora, na ETAPA 3 antes de chegar à ETAPA 5.


ETAPA 5: VERIFICANDO INTERESSE PELO PREPARATÓRIO

- DURAÇÃO: 1 ou 2 Runs.

- OBJETIVO: entender se o PA tem interesse em saber mais sobre o Preparatório.

- DETALHAMENTO:
	
	> Questione o PA se ele tem interesse em saber mais sobre o Preparatório.

	> Só depois de receber a resposta do PA confirmando o interesse dele em conhecer o serviço (por meio de mensagens como “Sim. Tenho interesse em conhecer o serviço.”, “Sim. Pode me contar sobre o Preparatório.” ou “Sim. Quero entender.”, por exemplo) envie suas mensagens em branco e altere as instruções para “Instruções - Fase 2”, conforme item “6) INSTRUÇÕES”. Não altere as instruções para “Instruções – Fase 2” antes de receber a confirmação do PA de que ele deseja conhecer o Preparatório.

	> Caso o PA não tenha interesse em conhecer o serviço, não o pressione. Deixe-o à vontade. Retorne a conversa à ETAPA 3 ou à ETAPA 4 e continue investigando sobre o PA, se ele lhe der abertura para isto.

- IMPORTÂNCIA RELATIVA: 40%

- TAMANHO MÁXIMO DE CADA MENSAGEM: 300 caracteres.

- OBSERVAÇÕES: -
	

5) ENGAJAMENTO

Classifique o nível de engajamento do PA na conversa em:

- “baixo”: 

> Avaliação Quantitativa: a maioria das mensagens do PA têm menos de 30 caracteres.

> Avaliação Qualitativa: as mensagens do PA estão mal escritas ou sem nexo.

- “médio”:

> Avaliação Quantitativa: a maioria das mensagens do PA têm de 30 a 100 caracteres.

> Avaliação Qualitativa: as mensagens do PA têm nexo e algum engajamento.


- “alto”: 

> Avaliação Quantitativa: a maioria das mensagens do PA têm de 50 a 200 caracteres.

> Avaliação Qualitativa: as mensagens do PA têm nexo e muito engajamento.


6) INSTRUÇÕES

Via de regra, o valor da variável instruções deve ser “Instruções - Fase 1”. 

Só na ETAPA 5, depois de você receber confirmação do PA de que ele tem interesse em conhecer mais sobre o serviço, retorne todas as suas mensagens em branco, como “”, e a variável instruções como “Instruções - Fase 2”, conforme este exemplo:

{
"mensagem_1": "",
"mensagem_2": "",
"mensagem_3": "",
"mensagem_4": "",
"mensagem_5": "",
"engajamento": "médio",
"data_retomada": "${data_run_mais_três_dias_formatada}",
"instruções": "Instruções - Fase 2",
"alerta": ""
}

OBSERVAÇÕES:

> Note que, para o valor das instruções ser “Instruções - Fase 2”, todas as mensagens devem ser enviadas obrigatoriamente em branco, como “”.

> Perceba que você só pode alterar as instruções para “Instruções – Fase 2” depois de o PA ter confirmado o interesse dele em conhecer o Preparatório, por meio de mensagens como “Sim. Tenho interesse em conhecer o serviço.”, “Sim. Pode me contar sobre o Preparatório.” ou “Sim. Quero entender.”, por exemplo.

> Não altere as instruções para “Instruções – Fase 2” antes de receber a confirmação do PA de que ele deseja conhecer o Preparatório.


7) DATA DE RETOMADA DE CONTATO

A data atual, em que a run está acontecendo, é ${data_run_formatada}.

Calcule a data_retomada adicionando 3 dias à data atual, levando em consideração a variação no número de dias em cada mês e anos bissextos. A data_retomada deve estar no formato dd/mmm/aaaa.

Ou seja, a data_retomada deve ser ${data_run_mais_três_dias_formatada}.


8) MENSAGENS DE RETOMADA DE CONTATO

A Ivy tem um sistema externo a você (Assistente GPT) que envia mensagens de retomada de contato ao PA como se fosse você. Isto acontece no dia especificado pela data_retomada.

Porém, atualmente o API de Assistentes da OpenAI não permite adicionar mensagens a uma conversa com role “assistant”.

Por isto, as mensagens de retomada de contato são adicionadas à conversa seguindo este Esquema JSON:

{
"role": "user",
"content": 
"{
"actualrole": "assistant",
"actualcontent":
"{
"mensagem_1": "",
"mensagem_2": "",
"mensagem_3": "",
"mensagem_4": "",
"mensagem_5": "",
"engajamento": "",
"data_retomada": "",
"instruções": "",
"alerta": ""
}"
}

Considere que mensagens adicionadas à conversa com um formato como este tenham sido enviadas por você ao PA. Ou seja, que o role é “assistant”, e não “user”.

 
9) ALERTA

O alerta será encaminhado à gerência da Ivy e deve ser enviado por você só caso o PA:

> Estiver com uma dúvida / problema que você não consegue resolver.

> Sinalizar que conhece pessoalmente o Lucas e deseja falar com ele.

> Ou se você precisar repassar qualquer tipo de observação.
`;

        console.log('Run acionada.');        

        // Executa a Run junto à OpenAI.
    
        const Run_ID_OpenAI = (await openai.beta.threads.runs.create( Thread_ID_OpenAI, { assistant_id: "asst_LcOLZWWuxM6rf3gkGZjhRwuN", instructions: Instruções_Assistente })).id;

        console.log(`ME.10. ${Run_ID_OpenAI} executada junto à OpenAI.`);
    
        // Anula o Agendamento_Run_OpenAI.

        Agendamento_Run_OpenAI = null;

        Controle_Agendamento_Runs_OpenAI.delete(ID_Agendamento_Run_OpenAI);

        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////
        // Atualiza o ID AGENDAMENTO RUN OPEN AI para "-" na BD - POTENCIAIS ALUNOS.
        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////

        await Microsoft_Graph_API_Client.api(`/users/b4a93dcf-5946-4cb2-8368-5db4d242a236/drive/items/0172BBJB3BYUNDDIMYQJF37AQWCYSADSTT/workbook/worksheets/{00000000-0001-0000-0000-000000000000}/tables/{AC8C07F3-9A79-4ABD-8CE8-0C818B0EA1A7}/rows/itemAt(index=${Index_LinhaRastreada})`)

            .patch({ values:[[null, null, null, null, '-', null, null, null, null, null, null, null, null, null, null]]});

        console.log('ME.11. ID AGENDAMENTO RUN OPEN AI  atualizado para "-" na BD - POTENCIAIS ALUNOS.');

        // Chama a função que Verifica o Status da Run.

        Verifica_Status_Run(MensagemEntrada_ManyChatSubscriberID, MensagemEntrada_Perfil, MensagemEntrada_NomeCompleto, Thread_ID_OpenAI, Run_ID_OpenAI, Index_LinhaRastreada);

    }, Tempo_até_Execução_Run);

    Controle_Agendamento_Runs_OpenAI.set(ID_Agendamento_Run_OpenAI, Agendamento_Run_OpenAI);

    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////
    // Há uma Execução de Run já programada para esta Thread?
    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////

    if (ID_Agendamento_Run_OpenAI_Anterior !== "-"){

        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////
        // Cancela execução da Run programada anteriormente.
        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////

        const Agendamento_Run_OpenAI_a_Cancelar = Controle_Agendamento_Runs_OpenAI.get(ID_Agendamento_Run_OpenAI_Anterior);
    
        clearTimeout(Agendamento_Run_OpenAI_a_Cancelar);

        Controle_Agendamento_Runs_OpenAI.delete(ID_Agendamento_Run_OpenAI_Anterior);
    
        console.log(`ME.5. Execução da Run programada anteriormente para a ${Thread_ID_OpenAI} cancelada.`);

    }

    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////
    // Registra nova EXECUÇÃO ID RUN OPENAI na BD - POTENCIAIS ALUNOS.
    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////

    await Microsoft_Graph_API_Client.api(`/users/b4a93dcf-5946-4cb2-8368-5db4d242a236/drive/items/0172BBJB3BYUNDDIMYQJF37AQWCYSADSTT/workbook/worksheets/{00000000-0001-0000-0000-000000000000}/tables/{AC8C07F3-9A79-4ABD-8CE8-0C818B0EA1A7}/rows/itemAt(index=${Index_LinhaRastreada})`)

        .patch({ values:[[null, null, null, null, ID_Agendamento_Run_OpenAI, null, null, null, null, null, null, null, null, null, null]]});

    console.log('ME.6. Novo registro de ID AGENDAMENTO RUN OPENAI realizado na BD - POTENCIAIS ALUNOS.');

    console.log(`ME.7. Run programada para acontecer em ${Tempo_até_Execução_Run}ms.`);

    console.log(`ME.8. Processamento da Mensagem de Entrada finalizado.`);

    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////
    // Retira a Mensagem de Entrada já processada da fila de processamento.
    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////

    Fila_Processamento_Mensagens_Entrada.shift();

    console.log(`ME.9. Mensagem de Entrada retirada da fila de processamento.`);

    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////
    // Processa a próxima Mensagem de Entrada na fila de processamento.
    //////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////

    if (Fila_Processamento_Mensagens_Entrada.length > 0) {

        await ProcessaMensagemEntrada(Fila_Processamento_Mensagens_Entrada[0]);
    
    }

};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PROCESSA MENSAGENS DE SAÍDA
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Importa a biblioteca necessária para fazer os HTTP POST ao ManyChat e configura a conexão.
const axios = require('axios');
const url = 'https://api.manychat.com/fb/subscriber/setCustomField';
const headers = {
  'accept': 'application/json',
  'Authorization': 'Bearer 881250:76d2acb1dcd7ddf429f70d584df3a07c',
  'Content-Type': 'application/json',
};


//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////
// Verifica status da run a cada 5s até que seja “completed”.
//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////

function Verifica_Status_Run(MensagemEntrada_ManyChatSubscriberID, MensagemEntrada_Perfil, MensagemEntrada_NomeCompleto, Thread_ID_OpenAI, Run_ID_OpenAI, Index_LinhaRastreada){

  let VerificaçãoID = setInterval(async function() {
    Processa_Run();
  }, 5000);
  
  async function Processa_Run() {
    
    const RunStatus = (await openai.beta.threads.runs.retrieve(Thread_ID_OpenAI, Run_ID_OpenAI)).status;

    console.log(`ME.12. O status atualizado da Run é ${RunStatus}.`);

    if (RunStatus === "completed") {
      
        // Pausa verificação do status se for "completed". 

        clearInterval(VerificaçãoID);
     
        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Obtém as informações criadas pela Run.
        
        const threadMessages = await openai.beta.threads.messages.list(Thread_ID_OpenAI);

        const ResultadoRunOpenAI = threadMessages.data.find(message => message.run_id === Run_ID_OpenAI).content[0].text.value;

        console.log("ME.13. Retorno da run junto à OpenAI recebido:");

        console.log(ResultadoRunOpenAI);

        const NúmeroMensagensSaída = 5;

        const MensagensSaída = [];

        MensagensSaída[0] = JSON.parse(threadMessages.data.find(message => message.run_id === Run_ID_OpenAI).content[0].text.value).mensagem_1;
        MensagensSaída[1] = JSON.parse(threadMessages.data.find(message => message.run_id === Run_ID_OpenAI).content[0].text.value).mensagem_2;
        MensagensSaída[2] = JSON.parse(threadMessages.data.find(message => message.run_id === Run_ID_OpenAI).content[0].text.value).mensagem_3;
        MensagensSaída[3] = JSON.parse(threadMessages.data.find(message => message.run_id === Run_ID_OpenAI).content[0].text.value).mensagem_4;
        MensagensSaída[4] = JSON.parse(threadMessages.data.find(message => message.run_id === Run_ID_OpenAI).content[0].text.value).mensagem_5;
        
        const NivelEngajamento = JSON.parse(threadMessages.data.find(message => message.run_id === Run_ID_OpenAI).content[0].text.value).engajamento;
        const Instruções = JSON.parse(threadMessages.data.find(message => message.run_id === Run_ID_OpenAI).content[0].text.value).instruções;
        const DataRetomada = JSON.parse(threadMessages.data.find(message => message.run_id === Run_ID_OpenAI).content[0].text.value).data_retomada;
        const AlertaOriginal = JSON.parse(threadMessages.data.find(message => message.run_id === Run_ID_OpenAI).content[0].text.value).alerta;
        let AlertaTratado = null;

        if (AlertaOriginal === ""){
            AlertaTratado = "-";
        } else {
            AlertaTratado = AlertaOriginal;
        }

        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////
        // Atualiza o ENGAJAMENTO, as INSTRUÇÕES PRÓXIMA RUN, o ALERTA e a DATA RETOMADA na BD - POTENCIAIS ALUNOS.
        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////

        await Microsoft_Graph_API_Client.api(`/users/b4a93dcf-5946-4cb2-8368-5db4d242a236/drive/items/0172BBJB3BYUNDDIMYQJF37AQWCYSADSTT/workbook/worksheets/{00000000-0001-0000-0000-000000000000}/tables/{AC8C07F3-9A79-4ABD-8CE8-0C818B0EA1A7}/rows/itemAt(index=${Index_LinhaRastreada})`)

            .patch({ values:[[null, null, null, null, null, null, NivelEngajamento, Instruções, null, AlertaTratado, DataRetomada, null, null, null, null]]});

        console.log('ME.14. ENGAJAMENTO, INSTRUÇÕES PRÓXIMA RUN e DATA RETOMADA atualizados na BD - POTENCIAIS ALUNOS.');

        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////
        // Assistente GPT enviou um alerta?
        //////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////

        if (AlertaTratado !== "-"){

            // Sim:

            //////////////////////////////////////////////////////////////////////////////////
            //////////////////////////////////////////////////////////////////////////////////
            // Encaminha o alerta por e-mail para contato@ivyroom.com.br.
            //////////////////////////////////////////////////////////////////////////////////
            //////////////////////////////////////////////////////////////////////////////////

            await Microsoft_Graph_API_Client.api(`/users/b4a93dcf-5946-4cb2-8368-5db4d242a236/sendMail`)
            
                .post({
                    "message": {
                        "subject": "Assistente GPT: Alerta Recebido",
                        "body": {
                            "contentType": "Text",
                            "content": `Potencial Aluno: ${MensagemEntrada_NomeCompleto}\n\nPerfil: ${MensagemEntrada_Perfil}\n\nAlerta: ${AlertaTratado}`
                        },
                        "toRecipients": [
                            {
                                "emailAddress": {
                                    "address": "contato@ivyroom.com.br"
                                }
                            }
                        ]
                    }
                });

        }

        //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        //Função que processa as mensagens de saída.
        
        let NúmeroMensagemSaídaProcessada = 0;

        Processa_Próxima_Mensagem_Saída();
    
        function Processa_Próxima_Mensagem_Saída() {

            //////////////////////////////////////////////////////////////////////////////////
            //////////////////////////////////////////////////////////////////////////////////
            // Encaminha uma DM ao ManyChat a cada 35s.
            //////////////////////////////////////////////////////////////////////////////////
            //////////////////////////////////////////////////////////////////////////////////

            const data = {
                subscriber_id: MensagemEntrada_ManyChatSubscriberID,
                field_id: 10238769,
                field_value: MensagensSaída[NúmeroMensagemSaídaProcessada],
            };

            axios.post(url, data, { headers })

            .then(response => {
                
                console.log(`ME.15. Mensagem de Saída enviada ao ManyChat. Status: ${response.status}.`);

                if (MensagensSaída[NúmeroMensagemSaídaProcessada + 1] === "" || NúmeroMensagemSaídaProcessada + 1 === NúmeroMensagensSaída){

                console.log("ME.16. Todas as Mensagens de Saída foram enviadas ao ManyChat com sucesso.");
                return;

                } else {

                    NúmeroMensagemSaídaProcessada++;
                    setTimeout(Processa_Próxima_Mensagem_Saída, 35000);

                }
            
            })

         }

    }

  }

}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PROCESSA MENSAGENS DE RETOMADA
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Processa DM vinda do Power Automate Desktop.
app.post('/power-automate-desktop-webhook/:Thread_ID_OpenAI_Retomada', async (req, res) => {    
 
    // Retorna mensagem de sucesso à request.
    res.status(200).send('Mensagens de Retomada recebidas pelo app.js com sucesso.');

    // Define as variáveis extraídas da DM.
    const MensagemRetomada_Thread_ID_OpenAI = req.params.Thread_ID_OpenAI_Retomada;
    const MensagemRetomada_Mensagem_1 = req.body.mensagem_1;
    const MensagemRetomada_Mensagem_2 = req.body.mensagem_2;
    const MensagemRetomada_Mensagem_3 = req.body.mensagem_3;
    const MensagemRetomada_Engajamento = req.body.engajamento;
    const MensagemRetomada_DataRetomada = req.body.data_retomada;

    await openai.beta.threads.messages.create( MensagemRetomada_Thread_ID_OpenAI, { role: "user", content: `{"actualrole": "assistant", "actualcontent": "{ "mensagem_1": "${MensagemRetomada_Mensagem_1}", "mensagem_2": "${MensagemRetomada_Mensagem_2}, "mensagem_3": "${MensagemRetomada_Mensagem_3}", "mensagem_4": "", "mensagem_5": "", "engajamento": "${MensagemRetomada_Engajamento}", "data_retomada": "${MensagemRetomada_DataRetomada}", "alerta": "" }"` });

    console.log(`MR.1. Mensagens de Retomada adicionadas à ${MensagemRetomada_Thread_ID_OpenAI} junto à OpenAI.`);

});
////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////
//// VERSÃO 5: 
//// - Webhook do ManyChat configurado.
//// - Variáveis da mensagem de entrada do Instagram definidas.
//// - Conexão com a base de dados SQL (BD-MENSAGENS) configurada.
////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////

//////////////////////////////////////////
// Cria conexão com a BD-MENSAGENS.
//////////////////////////////////////////

const sql = require('msnodesqlv8');
const connectionString = "Driver={ODBC Driver 18 for SQL Server};Server=tcp:servidor-v3.database.windows.net,1433;Database=BD-MENSAGENS-v2;Uid=servidor-v3-administrador;Pwd=Ivy@2019!;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;";

// const query = "INSERT INTO MENSAGENS (PSID, PERFIL, NOME_COMPLETO, DATA_E_HORA, TIPO, MENSAGEM) VALUES (?, ?)";

// const dataToInsert = ['some value', 'another value'];

// sql.query(connectionString, query, dataToInsert, (err, result) => {
//   if (err) {
//     console.error('Error inserting data:', err);
//   } else {
//     console.log('Data inserted successfully:', result);
//   }
// });


//////////////////////////////////////////
// Cria Webhook do ManyChat via express.
//////////////////////////////////////////

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.listen(port);
app.use(express.json());

app.post('/manychat-webhook/:UserIDUserNameMessageDateTime', (req, res) => {
  
  const MensagemIG_VariáveisConsolidadas = req.params.UserIDUserNameMessageDateTime;
  const MensagemIG_PSID = MensagemIG_VariáveisConsolidadas.split("@")[0];
  const MensagemIG_Perfil = MensagemIG_VariáveisConsolidadas.split("@")[1].split("*")[0];
  const MensagemIG_NomeCompleto = MensagemIG_VariáveisConsolidadas.split("@")[1].split("*")[1].split("!")[0];
  const MensagemIG_DataHora = MensagemIG_VariáveisConsolidadas.split("@")[1].split("*")[1].split("!")[1].substring(0, 23);
  const MensagemIG_Mensagem = req.body.Mensagem;

  // Insert data into the database
  const query =
  "INSERT INTO MENSAGENS (PSID, PERFIL, NOME_COMPLETO, DATA_E_HORA, TIPO, MENSAGEM) " +
  `VALUES (${MensagemIG_PSID}, '${MensagemIG_Perfil}', '${MensagemIG_NomeCompleto}', '${MensagemIG_DataHora}', 'R', '${MensagemIG_Mensagem}')`;

  sql.open(connectionString, (err, conn) => {
    if (err) {
      console.error('Error opening the connection:', err);
      return res.status(500).send('Internal Server Error');
    }

    conn.queryRaw(query, (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        conn.close(() => {
          console.log('Connection closed.');
          return res.status(500).send('Internal Server Error');
        });
      } else {
        console.log('Data inserted successfully:', results);

        // Close the connection
        conn.close(() => {
          console.log('Connection closed.');
          return res.status(200).send('Message received and inserted into the database.');
        });
      }
    });
  });

});

//console.log(MensagemIG_PSID, MensagemIG_Perfil, MensagemIG_NomeCompleto, MensagemIG_DataHora, MensagemIG_Mensagem);
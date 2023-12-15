const express = require('express');
const app = express();
const port = process.env.PORT;

app.listen(port);

app.post('/manychat/:variable', (req, res) => {
  
  const variableValue = req.params.variable;
  res.json({ message: 'This is the simplest version with variable: ${variableValue}' });
});
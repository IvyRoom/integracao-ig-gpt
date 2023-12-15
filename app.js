const express = require('express');
const app = express();
const port = process.env.PORT;

app.listen(port);

app.post('/manychat-webhook', (req, res) => {
  res.json({ message: 'This is the simplest version!' });
});
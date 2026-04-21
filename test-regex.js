const urlRegex = /^(https?:\/\/)?((([a-zA-Z\d]([a-zA-Z\d-]*[a-zA-Z\d])*)\.)+[a-zA-Z]{2,}|((\d{1,3}\.){3}\d{1,3}))(:\d+)?(\/[-a-zA-Z\d%_.~+]*)*(\?[;&a-zA-Z\d%_.~+=-]*)?(#[-a-zA-Z\d_]*)?$/;

const cases = [
  "halo",
  "Halo. Apa kabar?",
  "sebuah.kalimat",
  "apa.kabar",
  "youtube.com",
  "https://youtube.com",
  "t.co/12abc",
  "instagram.com/p/xyz123",
  "http://localhost:3000"
];

cases.forEach(c => console.log(`${c.padEnd(25)} : ${urlRegex.test(c)}`));

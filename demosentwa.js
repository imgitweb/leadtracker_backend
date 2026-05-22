import axios from "axios";


const ACCESS_TOKEN = "EAAKe4KIQfiIBRvfxGBUssZBcFbp1Y9MQZAATZA2JZCZBX23BZAUl8peQg5ZCjwZBtGguEnAxGgo5PMt5l4no07H2h83SyRaLhGpY1Yte3ZC7zW5PD8hPjqB1RCP4fP3HLCwlKAHlx65jTbMnl1tOVzR4Efap2FhpbTh5n4No65WoQvZAeowiZAZCxvZCmfC7zzrz0Yzuav5Wxe8ZAoF4RWXQD3em6ZBo3ZBD2PkQYlF7CTV1adMZAqNKU7ZAximSwarO8ZA8BuoQylt25IegUTd1iv4pKKiJ3zWu9VTZBPSSIMA5";
const PHONE_NUMBER_ID = "930058450199292";

async function sendTemplate() {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: "916261588851", // country code ke sath
        type: "template",
        template: {
          name: "general_enquiry", // approved template name
          language: {
            code: "en"
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("Message Sent:", response.data);

  } catch (err) {
    console.log(
      err.response?.data || err.message
    );
  }
}

sendTemplate();
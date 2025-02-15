const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service : "gmail" , 
  auth : {
    user: process.env.EMAIL,
    pass : process.env.PASSWORD,
  }
})

const sendEmail = async (to , name , affiliateLink ,currentPrice) => {
  try{
    const mailOptions = {
      from : process.env.EMAIL,
      to,
      subject: `Price Drop Alert for ${name}!`,
      html: `
        <h2>Good News! The price for ${name} has dropped.</h2>
        <p><strong>New Price:</strong> ₹${currentPrice}</p>
        <p>Check it out here: <a href="${affiliateLink}" target="_blank">Click Here</a></p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}`);
  }catch (error) {
    console.error("❌ Error sending email:", error.message);
  }
}

module.exports = sendEmail;
import express from "express";
import mailListener from "mail-listener2";
import xlsx from "xlsx";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 1000;

// Initialize mail listener
const mailListenerConfig = {
  username: "sameery.020@gmail.com",
  password: "amlb vboh umiw qcel",
  host: "imap.gmail.com",
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
  mailbox: "INBOX",
  markSeen: true,
  fetchUnreadOnStart: true,
};

const mailListenerInstance = new mailListener(mailListenerConfig);

// Start listening for emails
mailListenerInstance.start();

// Define jsonData1 and jsonData2 arrays
let jsonData1 = [];
let jsonData2 = [];

// Event listener for incoming emails
mailListenerInstance.on("mail", async (mail) => {
  // Check if the email is sent from the specified email address
  if (mail.from[0].address === "sameer.y020@gmail.com") {
    // Check if the email has attachments
    if (mail.attachments && mail.attachments.length > 0) {
      // Initialize mergedData for each email processing
      const mergedData = [];

      // Loop through each attachment
      for (const attachment of mail.attachments) {
        // Check if the attachment is an xlsx file
        if (
          attachment.contentType ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ) {
          try {
            // Convert Excel file to JSON in memory
            const workbook = xlsx.read(attachment.content, { type: "buffer" });
            const sheetName = workbook.SheetNames[0]; // Assuming only one sheet
            const jsonData = xlsx.utils.sheet_to_json(
              workbook.Sheets[sheetName],
              {
                range: 2,
              }
            );

            // Process each row of data
            const modifiedData = jsonData.map((item) => {
              const modifiedItem = {};
              for (const key in item) {
                if (Object.hasOwnProperty.call(item, key)) {
                  let modifiedKey = key
                    .toLowerCase() // Convert to lower case
                    .replace(/\s+/g, "_") // Replace spaces with underscores
                    .replace(/[^\w\s]/gi, "_") // Replace special characters with underscores
                    .replace(/\//g, "_"); // Replace forward slashes with underscores

                  // Specific transformation for date keys
                  if (
                    [
                      "job_date",
                      "invoice_date",
                      "be_date",
                      "igm_date",
                      "gateway_igm_date",
                      "out_of_charge",
                      "awb_bl_date",
                    ].includes(modifiedKey)
                  ) {
                    // Attempt to parse the date string
                    const date = new Date(item[key]);
                    if (!isNaN(date.getTime())) {
                      // If parsing successful, format the date to yyyy-mm-dd
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(
                        2,
                        "0"
                      );
                      const day = String(date.getDate()).padStart(2, "0");
                      modifiedItem[modifiedKey] = `${year}-${month}-${day}`;
                    } else {
                      // If parsing unsuccessful, keep the original value
                      modifiedItem[modifiedKey] = item[key];
                    }
                  } else if (modifiedKey === "job_no") {
                    // Extract job number and year from job_no
                    const match = item[key].split("/");
                    modifiedItem.job_no = match[3]; // Save job number
                    modifiedItem.year = match[4]; // Save year
                  } else if (modifiedKey === "importer") {
                    modifiedItem.importer = item[key];
                    // Convert importer name to small case, replace spaces with underscores, replace "-" with "_", and replace consecutive underscores with a single underscore
                    modifiedItem.importerURL = item[key]
                      .toLowerCase()
                      .replace(/\s+/g, "_")
                      .replace(/-/g, "_")
                      .replace(/_+/g, "_");
                  } else if (modifiedKey === "container_no") {
                    // Rename key from "container_no" to "container_nos"
                    modifiedItem.container_nos = item[key];
                  } else if (modifiedKey === "awb_bl_no_") {
                    // Rename key from "awb_bl_no_" to "awb_bl_no"
                    modifiedItem.awb_bl_no = item[key];
                  } else if (modifiedKey === "assbl__value") {
                    // Rename key from "assbl__value" to "assbl_value"
                    modifiedItem.assbl_value = item[key];
                  } else if (modifiedKey === "ex_rate") {
                    // Rename key from "ex_rate" to "exrate"
                    modifiedItem.exrate = item[key];
                  } else if (modifiedKey === "bill_no") {
                    // Remove duplicate bill no
                    modifiedItem.bill_no = item[key].split(",")[0];
                  } else if (modifiedKey === "bill_date") {
                    // Remove duplicate bill date
                    modifiedItem.bill_date = item[key].split(",")[0];
                  } else if (
                    modifiedKey !== "noofconts" &&
                    modifiedKey !== "noofcontsbytype" &&
                    modifiedKey !== "container_nos_"
                  ) {
                    // Exclude "noofconts", "noofcontsbytype", and "container_nos_" keys from the output
                    modifiedItem[modifiedKey] = item[key];
                  }
                }
              }
              return modifiedItem;
            });

            if (jsonData1.length === 0) {
              // First attachment, populate jsonData1
              jsonData1 = modifiedData;
            } else {
              // Second attachment, populate jsonData2
              jsonData2 = modifiedData;

              // Filter job numbers from both JSONs
              const jobNos1 = new Set(jsonData1.map((item) => item.job_no));
              const jobNos2 = new Set(jsonData2.map((item) => item.job_no));

              // Find common job numbers
              const commonJobNos = [...jobNos1].filter((jobNo) =>
                jobNos2.has(jobNo)
              );

              // Merge data for common job numbers
              commonJobNos.forEach((jobNo) => {
                const item1 = jsonData1.find((item) => item.job_no === jobNo);
                const item2 = jsonData2.find((item) => item.job_no === jobNo);
                const mergedItem = { ...item1, ...item2 };
                mergedData.push(mergedItem);
              });

              // Add data for unique job numbers from jsonData1
              const uniqueJobNos1 = [...jobNos1].filter(
                (jobNo) => !jobNos2.has(jobNo)
              );
              uniqueJobNos1.forEach((jobNo) => {
                const item = jsonData1.find((item) => item.job_no === jobNo);
                mergedData.push(item);
              });

              // Add data for unique job numbers from jsonData2
              const uniqueJobNos2 = [...jobNos2].filter(
                (jobNo) => !jobNos1.has(jobNo)
              );
              uniqueJobNos2.forEach((jobNo) => {
                const item = jsonData2.find((item) => item.job_no === jobNo);
                mergedData.push(item);
              });

              // Convert merged data's container number and seal no to array
              mergedData.forEach((item) => {
                // If container_nos and seal_no are present
                if (item.container_nos && item.seal_no) {
                  // Split container_nos and seal_no into arrays
                  const containerNumbers = item.container_nos.split(",");
                  const sealNumbers = item.seal_no.split(",");

                  // Create an array of objects with container_number and seal_no
                  const containers = containerNumbers.map(
                    (container, index) => ({
                      container_number: container.trim(),
                      seal_no: sealNumbers[index].trim(),
                    })
                  );

                  // Replace container_nos and seal_no with the array of objects
                  item.container_nos = containers;
                  delete item.seal_no; // Remove seal_no field
                }
              });

              // Now mergedData is in the desired format
              console.log("Merged Data:", JSON.stringify(mergedData));

              async function sendDataToAPI(data) {
                try {
                  const response = await axios.post(
                    "http://localhost:9002/api/jobs/addJob",
                    data
                  );
                  console.log("Response from API:", response.data);
                } catch (error) {
                  console.error("Error sending data to API:", error);
                }
              }

              sendDataToAPI(mergedData);
            }
          } catch (error) {
            console.error("Excel file can not be converted to JSON");
          }
        } else {
          console.log("Attachment is not an excel file");
        }
      }
    } else {
      console.log("No attachments found in email");
    }
  } else {
    console.log("Email is not from sameer.y020@gmail.com. Ignored.");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

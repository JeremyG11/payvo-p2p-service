import fs from "fs/promises";
import path from "path";

/**
 * Reads an email template and replaces placeholders with dynamic data.
 * @param templateName - The name of the template file (e.g., "OTP-Verification.html")
 * @param variables - An object containing placeholder variables and their values
 * @returns {Promise<string>} - The rendered HTML string
 */
export const renderEmailTemplate = async (
  templateName: string,
  variables: Record<string, string>
): Promise<string> => {
  try {
    // Resolve the template file path
    const templatePath = path.join(
      process.cwd(),
      "src/lib/mails/templates",
      templateName
    );

    // Read the template file
    let templateContent = await fs.readFile(templatePath, "utf-8");

    // Replace placeholders with actual values
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      templateContent = templateContent.replace(
        new RegExp(placeholder, "g"),
        value
      );
    }

    return templateContent;
  } catch (error) {
    console.error(`Error reading email template "${templateName}":`, error);
    throw new Error("Failed to render email template");
  }
};

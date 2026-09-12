import { LegalDoc, LegalBlock } from "@/components/LegalDoc";

// Source: Dosed Terms & Conditions. Legal name, contact email, and
// governing-law jurisdiction filled in for Shayan Asad (Eswatini).
const BLOCKS: LegalBlock[] = [
  { type: "p", text: "App: Dosed" },
  { type: "p", text: "Contact: liteishere@gmail.com" },
  { type: "p", text: "These Terms and Conditions (\"Terms\") form a legally binding agreement between you and Shayan Asad governing your access to and use of the Dosed mobile application. By creating an account or using the App you agree to these Terms. If you do not agree, do not use the App." },

  { type: "h1", text: "1. The Service" },
  { type: "p", text: "Dosed is a personal tool that helps you track medications for your pets, schedule reminders, log doses, and synchronise data across your own devices. It also allows optional storage of pet photos." },
  { type: "p", text: "Important: Dosed is not a medical or veterinary device. It does not provide medical, veterinary, or pharmaceutical advice. Always consult a qualified veterinarian regarding your pet's health and medications." },

  { type: "h1", text: "2. Eligibility" },
  { type: "p", text: "You must be at least 18 years old (or the age of digital consent in your jurisdiction) and capable of entering into a binding contract. By using the App you represent that you meet these requirements." },

  { type: "h1", text: "3. Account registration and security" },
  { type: "li", text: "You must provide accurate registration information." },
  { type: "li", text: "You are responsible for maintaining the confidentiality of your credentials and for all activity under your account." },
  { type: "li", text: "Notify us promptly of any unauthorised use." },
  { type: "li", text: "We may suspend or terminate accounts that violate these Terms, pose a security risk, or that are used for fraudulent or harmful purposes." },

  { type: "h1", text: "4. Acceptable use" },
  { type: "p", text: "You agree not to:" },
  { type: "li", text: "Use the App for any unlawful purpose" },
  { type: "li", text: "Attempt to gain unauthorised access to systems, accounts, or data" },
  { type: "li", text: "Interfere with or disrupt the service" },
  { type: "li", text: "Upload illegal, harmful, or infringing content" },
  { type: "li", text: "Reverse-engineer, scrape, or overload the App" },
  { type: "li", text: "Use the App in a commercial veterinary practice setting without appropriate professional oversight and compliance with applicable regulations" },
  { type: "li", text: "Misrepresent your identity or affiliation" },

  { type: "h1", text: "5. Your content" },
  { type: "p", text: "You retain ownership of the content you create (pet records, medication data, dose logs, photos, notes). By using the App you grant us a limited licence to host, store, process, and display that content solely as needed to provide and improve the service and as described in the Privacy Policy." },
  { type: "p", text: "You are solely responsible for the information you enter and for ensuring you have the rights necessary to upload any photos or other content." },

  { type: "h1", text: "6. Medical / veterinary disclaimer" },
  { type: "p", text: "The App is an organisational aid only. We make no warranties regarding the accuracy, completeness, or suitability of any information recorded or displayed. You remain solely responsible for all decisions relating to your pets' care and medication. We accept no liability for missed doses, incorrect dosing, adverse reactions, or any other health-related consequence." },

  { type: "h1", text: "7. Intellectual property" },
  { type: "p", text: "The App, including its software, design, branding, and documentation, is owned by us or our licensors. You are granted a limited, non-exclusive, non-transferable, revocable licence to use the App for personal, non-commercial purposes in accordance with these Terms. You may not copy, modify, distribute, sell, or create derivative works based on the App except as expressly permitted." },

  { type: "h1", text: "8. Termination" },
  { type: "p", text: "You may stop using the App and delete your account at any time." },
  { type: "p", text: "We may suspend or terminate your access immediately if you breach these Terms or if we reasonably believe continued access could create risk or legal exposure. Upon termination your right to use the App ceases. Provisions that by their nature should survive (including disclaimers, limitations of liability, and indemnity) will survive termination." },

  { type: "h1", text: "9. Disclaimers" },
  { type: "p", text: "THE APP IS PROVIDED \"AS IS\" AND \"AS AVAILABLE\" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED, ERROR-FREE, OR COMPLETELY SECURE." },

  { type: "h1", text: "10. Limitation of liability" },
  { type: "p", text: "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, WE AND OUR OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO YOUR USE OF (OR INABILITY TO USE) THE APP." },
  { type: "p", text: "OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THESE TERMS OR THE APP SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US (IF ANY) IN THE TWELVE MONTHS PRECEDING THE CLAIM, OR (B) FIFTY POUNDS STERLING (OR THE LOCAL EQUIVALENT)." },
  { type: "p", text: "Nothing in these Terms excludes or limits liability for death or personal injury caused by negligence, fraud, or any other liability that cannot be excluded or limited under applicable law (including mandatory consumer protection laws in the EU, UK, Australia, or California)." },

  { type: "h1", text: "11. Indemnity" },
  { type: "p", text: "You agree to indemnify and hold us harmless from any claims, losses, liabilities, damages, costs, and expenses (including reasonable legal fees) arising out of or related to your breach of these Terms, your content, or your use of the App, except to the extent caused by our gross negligence or wilful misconduct." },

  { type: "h1", text: "12. Changes to the App or Terms" },
  { type: "p", text: "We may modify the App or these Terms from time to time. We will update the \"Last updated\" date and, where required, notify you of material changes through the App or by email. Continued use after the effective date constitutes acceptance of the revised Terms, except where applicable law requires additional consent." },

  { type: "h1", text: "13. Governing law and dispute resolution" },
  { type: "p", text: "These Terms are governed by the laws of Eswatini, without regard to conflict-of-law principles." },
  { type: "p", text: "Courts of that jurisdiction shall have exclusive jurisdiction, except that:" },
  { type: "li", text: "Consumers in the European Union/United Kingdom may bring proceedings in their country of residence and benefit from mandatory consumer protection provisions of that country." },
  { type: "li", text: "Australian consumers retain all rights and remedies under the Australian Consumer Law." },
  { type: "li", text: "California residents retain rights under applicable California consumer protection laws." },
  { type: "p", text: "Nothing in these Terms limits any non-waivable statutory rights you may have as a consumer." },

  { type: "h1", text: "14. General" },
  { type: "li", text: "If any provision is found unenforceable, the remaining provisions remain in effect." },
  { type: "li", text: "These Terms constitute the entire agreement between you and us regarding the App and supersede prior agreements on the same subject." },
  { type: "li", text: "Our failure to enforce any right is not a waiver of that right." },
  { type: "li", text: "You may not assign your rights under these Terms without our prior written consent. We may assign our rights and obligations." },

  { type: "h1", text: "15. Contact" },
  { type: "p", text: "Questions about these Terms: liteishere@gmail.com" },
];

export default function TermsAndConditions() {
  return <LegalDoc updated="12 September 2026" blocks={BLOCKS} />;
}

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function uploadPDFsToSupabase() {
  try {
    // Get all client documents with local file URLs
    const { data: documents, error } = await supabase
      .from('pdf_documents')
      .select('id, filename, url, municipality_id')
      .eq('document_source', 'client')
      .like('url', 'file:////Users/noahvanhart/Downloads/Bylaw/%');

    if (error) {
      console.error('Error fetching documents:', error);
      return;
    }

    console.log(`Found ${documents.length} documents to upload`);

    let successCount = 0;
    let errorCount = 0;

    for (const doc of documents) {
      try {
        // Convert file:// URL to actual file path
        const filePath = doc.url.replace('file:////', '/');
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
          console.error(`File not found: ${filePath}`);
          errorCount++;
          continue;
        }

        // Read the file
        const fileBuffer = await readFile(filePath);
        
        // Create storage path
        const storagePath = `pdfs/${doc.municipality_id}/${doc.filename}`;
        
        console.log(`Uploading ${doc.filename} to ${storagePath}...`);

        // Upload to Supabase storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documents')
          .upload(storagePath, fileBuffer, {
            contentType: 'application/pdf',
            upsert: true // Overwrite if exists
          });

        if (uploadError) {
          console.error(`Upload error for ${doc.filename}:`, uploadError);
          errorCount++;
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(storagePath);

        // Update database record with new URL
        const { error: updateError } = await supabase
          .from('pdf_documents')
          .update({ 
            url: urlData.publicUrl,
            storage_path: storagePath,
            file_size: fileBuffer.length
          })
          .eq('id', doc.id);

        if (updateError) {
          console.error(`Database update error for ${doc.filename}:`, updateError);
          errorCount++;
        } else {
          console.log(`✓ Successfully uploaded ${doc.filename}`);
          successCount++;
        }

      } catch (err) {
        console.error(`Error processing ${doc.filename}:`, err);
        errorCount++;
      }
    }

    console.log(`\nUpload complete!`);
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);

  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Run the upload
uploadPDFsToSupabase();
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    const chunks = [];
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadAndUploadExternalPDFs() {
  try {
    // Get client documents with external URLs
    const { data: documents, error } = await supabase
      .from('pdf_documents')
      .select('id, filename, url, municipality_id')
      .eq('document_source', 'client')
      .not('url', 'like', 'https://txtifyjqmgdlhcmzpfvm.supabase.co%')
      .not('url', 'like', 'file://%');

    if (error) {
      console.error('Error fetching documents:', error);
      return;
    }

    console.log(`Found ${documents.length} external documents to download and upload`);

    let successCount = 0;
    let errorCount = 0;

    for (const doc of documents) {
      try {
        console.log(`Downloading ${doc.filename} from ${doc.url}...`);
        
        // Download the file
        const fileBuffer = await downloadFile(doc.url);
        
        // Clean filename for storage path
        const cleanFilename = doc.filename
          .replace(/[_|]/g, '-')
          .replace(/\s+/g, '-')
          .replace(/--+/g, '-')
          .replace(/[()]/g, '');
        
        const storagePath = `pdfs/${doc.municipality_id}/${cleanFilename}`;
        
        console.log(`Uploading to ${storagePath}...`);

        // Upload to Supabase storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documents')
          .upload(storagePath, fileBuffer, {
            contentType: 'application/pdf',
            upsert: true
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
          console.log(`✓ Successfully processed ${doc.filename}`);
          successCount++;
        }

      } catch (err) {
        console.error(`Error processing ${doc.filename}:`, err.message);
        errorCount++;
      }
    }

    console.log(`\nProcess complete!`);
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);

  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Run the download and upload
downloadAndUploadExternalPDFs();
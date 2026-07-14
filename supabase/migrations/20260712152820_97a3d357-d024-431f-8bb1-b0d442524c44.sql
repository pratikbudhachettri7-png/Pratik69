
CREATE POLICY "public read bill-attachments" ON storage.objects FOR SELECT USING (bucket_id = 'bill-attachments');
CREATE POLICY "public write bill-attachments" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'bill-attachments');
CREATE POLICY "public update bill-attachments" ON storage.objects FOR UPDATE USING (bucket_id = 'bill-attachments');
CREATE POLICY "public delete bill-attachments" ON storage.objects FOR DELETE USING (bucket_id = 'bill-attachments');

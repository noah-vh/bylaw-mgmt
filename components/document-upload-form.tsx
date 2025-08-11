"use client"

import React, { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Upload, FileText, AlertCircle, CheckCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"

// Form validation schema
const uploadFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(255, "Title is too long"),
  municipality_id: z.number().min(1, "Please select a municipality"),
  date_published: z.string().optional(),
  is_adu_relevant: z.boolean().optional().default(false),
  file: z.instanceof(File, { message: "Please select a PDF file" })
    .refine((file) => file.type === 'application/pdf', "Only PDF files are allowed")
    .refine((file) => file.size <= 50 * 1024 * 1024, "File size must be less than 50MB")
})

type UploadFormData = z.infer<typeof uploadFormSchema>

interface Municipality {
  id: number
  name: string
}

interface DocumentUploadFormProps {
  municipalities: Municipality[]
  onUploadSuccess?: (document: any) => void
  onCancel?: () => void
}

export function DocumentUploadForm({ municipalities, onUploadSuccess, onCancel }: DocumentUploadFormProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset
  } = useForm({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      is_adu_relevant: false
    }
  })

  const watchedValues = watch()

  const handleFileSelect = (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error("Only PDF files are allowed")
      return
    }
    
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File size must be less than 50MB")
      return
    }

    setSelectedFile(file)
    setValue('file', file)
    
    // Auto-populate title from filename if not already set
    if (!watchedValues.title) {
      const titleFromFilename = file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ')
      setValue('title', titleFromFilename)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const onSubmit = async (data: any) => {
    if (!selectedFile) {
      toast.error("Please select a file")
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('title', data.title)
      formData.append('municipality_id', data.municipality_id.toString())
      formData.append('is_adu_relevant', data.is_adu_relevant.toString())
      
      if (data.date_published) {
        formData.append('date_published', data.date_published)
      }

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      toast.success("Document uploaded successfully!")
      
      // Reset form
      reset()
      setSelectedFile(null)
      
      // Call success callback
      if (onUploadSuccess) {
        onUploadSuccess(result.data)
      }

    } catch (error) {
      console.error('Upload error:', error)
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Bylaw Document
        </CardTitle>
        <CardDescription>
          Upload a PDF document and provide metadata for your municipal bylaw collection
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* File Upload Area */}
          <div className="space-y-2">
            <Label>PDF File</Label>
            <div
              className={`
                border-2 border-dashed rounded-lg p-8 text-center transition-colors
                ${isDragOver ? 'border-primary bg-primary/5' : 'border-gray-300'}
                ${selectedFile ? 'border-green-500 bg-green-50' : ''}
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {selectedFile ? (
                <div className="space-y-2">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">{selectedFile.name}</span>
                  </div>
                  <p className="text-sm text-gray-500">
                    Size: {formatFileSize(selectedFile.size)}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedFile(null)
                      setValue('file', undefined as any)
                    }}
                  >
                    Remove File
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                  <div>
                    <p className="text-lg font-medium">Drop your PDF here</p>
                    <p className="text-sm text-gray-500">or click to browse</p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileInputChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('file-upload')?.click()}
                  >
                    Choose File
                  </Button>
                </div>
              )}
            </div>
            {errors.file && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {errors.file.message}
              </p>
            )}
          </div>

          {/* Title Field */}
          <div className="space-y-2">
            <Label htmlFor="title">Document Title *</Label>
            <Input
              id="title"
              {...register('title')}
              placeholder="e.g., Accessory Dwelling Unit Bylaw 2024"
            />
            {errors.title && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {errors.title.message}
              </p>
            )}
          </div>

          {/* Municipality Selection */}
          <div className="space-y-2">
            <Label>Municipality *</Label>
            <Select onValueChange={(value) => setValue('municipality_id', parseInt(value))}>
              <SelectTrigger>
                <SelectValue placeholder="Select a municipality" />
              </SelectTrigger>
              <SelectContent>
                {municipalities.map((municipality) => (
                  <SelectItem key={municipality.id} value={municipality.id.toString()}>
                    {municipality.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.municipality_id && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {errors.municipality_id.message}
              </p>
            )}
          </div>

          {/* Date Published */}
          <div className="space-y-2">
            <Label htmlFor="date_published">Date Published (Optional)</Label>
            <Input
              id="date_published"
              type="date"
              {...register('date_published')}
            />
          </div>

          {/* ADU Relevant Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_adu_relevant"
              checked={watchedValues.is_adu_relevant}
              onCheckedChange={(checked) => setValue('is_adu_relevant', !!checked)}
            />
            <Label htmlFor="is_adu_relevant" className="flex items-center gap-2">
              Mark as ADU Relevant
              <Badge variant="secondary" className="text-xs">
                Optional
              </Badge>
            </Label>
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isUploading || !selectedFile}
              className="flex-1"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </>
              )}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isUploading}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
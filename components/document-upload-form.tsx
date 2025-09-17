"use client"

import React, { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Upload, FileText, AlertCircle, Loader2, X } from "lucide-react"
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
  municipality_id: z.number({
    required_error: "Please select a municipality",
    invalid_type_error: "Please select a municipality"
  }).min(1, "Please select a municipality"),
  url: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  date_published: z.string().optional(),
  is_adu_relevant: z.boolean().optional().default(false),
  file: z.instanceof(File, { message: "Please select a PDF file" })
    .refine((file) => file.type === 'application/pdf', "Only PDF files are allowed")
    .refine((file) => file.size <= 50 * 1024 * 1024, "File size must be less than 50MB")
    .optional()
}).refine((data) => data.file || data.url, {
  message: "Either a file upload or URL is required",
  path: ["file"]
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
      is_adu_relevant: false,
      municipality_id: 0, // Initialize with 0 instead of undefined
      url: '',
      title: '',
      date_published: ''
    }
  })

  const watchedValues = watch()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      
      if (file.type !== 'application/pdf') {
        toast.error("Only PDF files are allowed")
        e.target.value = '' // Reset input
        return
      }
      
      if (file.size > 50 * 1024 * 1024) {
        toast.error("File size must be less than 50MB")
        e.target.value = '' // Reset input
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
  }

  const onSubmit = async (data: any) => {
    console.log('Form data:', data) // Debug log
    
    if (!selectedFile && !data.url) {
      toast.error("Please select a file or enter a URL")
      return
    }

    if (!data.municipality_id) {
      toast.error("Please select a municipality")
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      if (selectedFile) {
        formData.append('file', selectedFile)
      }
      formData.append('title', data.title)
      // Make sure municipality_id is properly set
      const municipalityId = data.municipality_id
      console.log('Municipality ID being sent:', municipalityId)
      if (!municipalityId || municipalityId === 0) {
        toast.error('Please select a valid municipality')
        setIsUploading(false)
        return
      }
      formData.append('municipality_id', municipalityId.toString())
      formData.append('is_adu_relevant', (data.is_adu_relevant || false).toString())
      
      if (data.url) {
        formData.append('url', data.url)
      }
      
      if (data.date_published) {
        formData.append('date_published', data.date_published)
      }

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })

      // Check if we got a non-JSON response (like HTML error page)
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Non-JSON response received:', response.status, response.statusText)
        
        // Handle specific error codes
        if (response.status === 413) {
          throw new Error('File too large. Maximum file size is 50MB.')
        } else if (response.status === 502 || response.status === 504) {
          throw new Error('Server timeout. The file may be too large or the server is busy. Please try a smaller file.')
        }
        
        throw new Error(`Server error (${response.status}): ${response.statusText}`)
      }

      const result = await response.json()

      if (!response.ok) {
        console.error('Upload failed with status:', response.status)
        console.error('Upload failed result:', result)
        
        // Handle different error formats
        let errorMessage = 'Upload failed'
        
        // First check for error field
        if (result.error) {
          errorMessage = result.error
        }
        // Then check for details field  
        else if (result.details) {
          if (typeof result.details === 'string') {
            errorMessage = `${result.error || 'Error'}: ${result.details}`
          } else if (result.details._errors) {
            errorMessage = result.details._errors.join(', ')
          } else {
            errorMessage = JSON.stringify(result.details)
          }
        }
        // If we still have generic message, add status code
        if (errorMessage === 'Upload failed') {
          errorMessage = `Upload failed (${response.status})`
        }
        
        throw new Error(errorMessage)
      }

      toast.success("Document added successfully!")
      
      // Reset form
      reset()
      setSelectedFile(null)
      // Reset file input
      const fileInput = document.getElementById('file-upload-hidden') as HTMLInputElement
      if (fileInput) fileInput.value = ''
      
      // Call success callback
      if (onUploadSuccess) {
        onUploadSuccess(result.data)
      }

    } catch (error) {
      console.error('Upload error caught:', error)
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      toast.error(errorMessage, {
        duration: 5000,
        description: 'Check the console for more details'
      })
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
        <Select 
          onValueChange={(value) => {
            const numValue = parseInt(value)
            console.log('Municipality selected:', numValue) // Debug log
            setValue('municipality_id', numValue, { shouldValidate: true })
          }}
        >
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

      {/* URL and File Upload - Side by Side */}
      <div className="space-y-2">
        <Label htmlFor="url">Document URL or File *</Label>
        <div className="flex gap-2">
          <Input
            id="url"
            type="url"
            {...register('url')}
            placeholder="https://example.com/bylaws/document.pdf"
            className="flex-1"
          />
          <input
            id="file-upload-hidden"
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => document.getElementById('file-upload-hidden')?.click()}
            className="px-3"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload PDF
          </Button>
        </div>
        {errors.url && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {errors.url.message}
          </p>
        )}
        {errors.file && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {errors.file.message}
          </p>
        )}
        {selectedFile && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded text-sm">
            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="flex-1 truncate">{selectedFile.name}</span>
            <span className="text-gray-500">({formatFileSize(selectedFile.size)})</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedFile(null)
                setValue('file', undefined as any)
                const fileInput = document.getElementById('file-upload-hidden') as HTMLInputElement
                if (fileInput) fileInput.value = ''
              }}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <p className="text-sm text-gray-500">
          Enter a URL or upload a PDF file (at least one required)
        </p>
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
        <Label htmlFor="is_adu_relevant" className="flex items-center gap-2 cursor-pointer">
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
          disabled={isUploading}
          className="flex-1"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Adding Document...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Add Document
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
  )
}
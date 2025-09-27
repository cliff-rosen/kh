import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Building2, Save, RotateCcw, X } from 'lucide-react';

import { workbenchApi, CompanyProfile } from '@/lib/api/workbenchApi';

interface CompanyProfileManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompanyProfileManagementModal({
  open,
  onOpenChange
}: CompanyProfileManagementModalProps) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    company_name: '',
    company_description: '',
    business_focus: '',
    research_interests: '',
    therapeutic_areas: '',
    key_compounds: '',
    pathways_of_interest: '',
    competitive_landscape: '',
    research_agent_role: '',
    analysis_focus: ''
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      loadProfile();
    } else {
      setHasChanges(false);
    }
  }, [open]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const profileData = await workbenchApi.getCompanyProfile();
      setProfile(profileData);
      setFormData({
        company_name: profileData.company_name || '',
        company_description: profileData.company_description || '',
        business_focus: profileData.business_focus || '',
        research_interests: profileData.research_interests || '',
        therapeutic_areas: profileData.therapeutic_areas || '',
        key_compounds: profileData.key_compounds || '',
        pathways_of_interest: profileData.pathways_of_interest || '',
        competitive_landscape: profileData.competitive_landscape || '',
        research_agent_role: profileData.research_agent_role || '',
        analysis_focus: profileData.analysis_focus || ''
      });
      setHasChanges(false);
    } catch (error) {
      console.error('Error loading company profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to load company profile',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const updatedProfile = await workbenchApi.updateCompanyProfile(formData);
      setProfile(updatedProfile);
      setHasChanges(false);

      toast({
        title: 'Profile Updated',
        description: 'Your company profile has been updated successfully.',
      });
    } catch (error) {
      console.error('Error updating company profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to update company profile',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (profile) {
      setFormData({
        company_name: profile.company_name || '',
        company_description: profile.company_description || '',
        business_focus: profile.business_focus || '',
        research_interests: profile.research_interests || '',
        therapeutic_areas: profile.therapeutic_areas || '',
        key_compounds: profile.key_compounds || '',
        pathways_of_interest: profile.pathways_of_interest || '',
        competitive_landscape: profile.competitive_landscape || '',
        research_agent_role: profile.research_agent_role || '',
        analysis_focus: profile.analysis_focus || ''
      });
      setHasChanges(false);
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      const shouldClose = window.confirm('You have unsaved changes. Are you sure you want to close?');
      if (!shouldClose) return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Manage Company Profile
          </DialogTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Customize how the AI research agent understands your company's context and interests.
            This information is used to personalize article analysis and recommendations.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading company profile...</div>
          ) : (
            <div className="space-y-6">
              {/* Company Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
                  Company Information
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="company_name">Company Name *</Label>
                    <Input
                      id="company_name"
                      value={formData.company_name}
                      onChange={(e) => handleInputChange('company_name', e.target.value)}
                      placeholder="Your Company Name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="research_agent_role">Research Agent Role</Label>
                    <Input
                      id="research_agent_role"
                      value={formData.research_agent_role}
                      onChange={(e) => handleInputChange('research_agent_role', e.target.value)}
                      placeholder="research agent"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="company_description">Company Description</Label>
                  <Textarea
                    id="company_description"
                    value={formData.company_description}
                    onChange={(e) => handleInputChange('company_description', e.target.value)}
                    placeholder="Brief description of your company"
                    className="h-20"
                  />
                </div>

                <div>
                  <Label htmlFor="business_focus">Business Focus *</Label>
                  <Textarea
                    id="business_focus"
                    value={formData.business_focus}
                    onChange={(e) => handleInputChange('business_focus', e.target.value)}
                    placeholder="What your company is focused on (e.g., developing novel therapies...)"
                    className="h-20"
                  />
                </div>
              </div>

              {/* Research Context */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
                  Research Context
                </h3>

                <div>
                  <Label htmlFor="research_interests">Research Interests</Label>
                  <Textarea
                    id="research_interests"
                    value={formData.research_interests}
                    onChange={(e) => handleInputChange('research_interests', e.target.value)}
                    placeholder="Topics and areas of research interest (e.g., safety and efficacy studies, specific compounds...)"
                    className="h-24"
                  />
                </div>

                <div>
                  <Label htmlFor="therapeutic_areas">Therapeutic Areas</Label>
                  <Textarea
                    id="therapeutic_areas"
                    value={formData.therapeutic_areas}
                    onChange={(e) => handleInputChange('therapeutic_areas', e.target.value)}
                    placeholder="Therapeutic areas of interest (e.g., fibrosis, inflammation, obesity...)"
                    className="h-20"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="key_compounds">Key Compounds</Label>
                    <Textarea
                      id="key_compounds"
                      value={formData.key_compounds}
                      onChange={(e) => handleInputChange('key_compounds', e.target.value)}
                      placeholder="Important compounds or drugs"
                      className="h-20"
                    />
                  </div>

                  <div>
                    <Label htmlFor="pathways_of_interest">Pathways of Interest</Label>
                    <Textarea
                      id="pathways_of_interest"
                      value={formData.pathways_of_interest}
                      onChange={(e) => handleInputChange('pathways_of_interest', e.target.value)}
                      placeholder="Biological pathways of interest"
                      className="h-20"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="competitive_landscape">Competitive Landscape</Label>
                  <Textarea
                    id="competitive_landscape"
                    value={formData.competitive_landscape}
                    onChange={(e) => handleInputChange('competitive_landscape', e.target.value)}
                    placeholder="Information about competitors and competitive threats"
                    className="h-20"
                  />
                </div>
              </div>

              {/* AI Configuration */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
                  AI Analysis Focus
                </h3>

                <div>
                  <Label htmlFor="analysis_focus">Additional Analysis Instructions</Label>
                  <Textarea
                    id="analysis_focus"
                    value={formData.analysis_focus}
                    onChange={(e) => handleInputChange('analysis_focus', e.target.value)}
                    placeholder="Additional instructions for how the AI should analyze articles (optional)"
                    className="h-24"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with action buttons */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <Button
            variant="ghost"
            onClick={handleClose}
            className="flex items-center gap-2"
          >
            <X className="h-4 w-4" />
            Close
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasChanges || saving}
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
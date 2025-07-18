
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface LearningEntry {
  id: string;
  numeroId: number;
  content: string;
  context?: string;
  tags: string[];
  createdAt: string;
  step: number;
  reviews: Array<{ date: string; questions?: string[]; answers?: string[]; step?: number }>;
}

interface Review {
  date: string;
  questions?: string[];
  answers?: string[];
  step?: number;
}

export const useSupabaseLearning = () => {
  const [learningEntries, setLearningEntries] = useState<LearningEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Helper function to safely convert Json to Review array
  const convertJsonToReviews = (jsonData: any): Review[] => {
    if (!jsonData) return [];
    if (!Array.isArray(jsonData)) return [];
    
    return jsonData.map((item: any) => ({
      date: item?.date || new Date().toISOString(),
      questions: Array.isArray(item?.questions) ? item.questions : [],
      answers: Array.isArray(item?.answers) ? item.answers : [],
      step: typeof item?.step === 'number' ? item.step : 0
    }));
  };

  // Carregar entradas do Supabase
  const loadEntries = async () => {
    try {
      const { data, error } = await supabase
        .from('revisoes')
        .select('*')
        .order('numero_id', { ascending: false });

      if (error) {
        console.error('Erro ao carregar entradas:', error);
        toast({
          title: "Erro ao carregar dados",
          description: "Verifique sua conexão e tente novamente",
          variant: "destructive"
        });
        return;
      }

      // Converter dados do Supabase para o formato esperado
      const entries: LearningEntry[] = data?.map(item => ({
        id: item.id,
        numeroId: item.numero_id,
        content: item.conteudo,
        context: item.contexto || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        createdAt: item.data_criacao || new Date().toISOString(),
        step: item.step || 0,
        reviews: convertJsonToReviews(item.revisoes)
      })) || [];

      setLearningEntries(entries);
    } catch (error) {
      console.error('Erro inesperado ao carregar entradas:', error);
      toast({
        title: "Erro inesperado",
        description: "Tente recarregar a página",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Adicionar nova entrada
  const addLearningEntry = async (content: string, context?: string, tags?: string[]) => {
    try {
      const newEntry = {
        conteudo: content,
        contexto: context || null,
        tags: tags || [],
        step: 0,
        revisoes: [],
        data_criacao: new Date().toISOString(),
        data_ultima_revisao: new Date().toISOString(),
        usuario_id: null
      };

      const { data, error } = await supabase
        .from('revisoes')
        .insert([newEntry])
        .select()
        .single();

      if (error) {
        console.error('Erro ao adicionar entrada:', error);
        toast({
          title: "Erro ao salvar",
          description: "Verifique sua conexão e tente novamente",
          variant: "destructive"
        });
        return;
      }

      // Converter e adicionar à lista
      const convertedEntry: LearningEntry = {
        id: data.id,
        numeroId: data.numero_id,
        content: data.conteudo,
        context: data.contexto || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        createdAt: data.data_criacao || new Date().toISOString(),
        step: data.step || 0,
        reviews: convertJsonToReviews(data.revisoes)
      };

      setLearningEntries(prev => [convertedEntry, ...prev]);
      toast({
        title: "Aprendizado salvo!",
        description: `Aprendizado #${String(data.numero_id).padStart(4, '0')} foi salvo com sucesso.`
      });
    } catch (error) {
      console.error('Erro inesperado ao adicionar entrada:', error);
      toast({
        title: "Erro inesperado",
        description: "Tente novamente",
        variant: "destructive"
      });
    }
  };

  // Completar revisão
  const completeReview = async (entryId: string, questions?: string[], answers?: string[]) => {
    try {
      const entry = learningEntries.find(e => e.id === entryId);
      if (!entry) return;

      const newStep = Math.min((entry.step || 0) + 1, 5);
      const newReview: Review = {
        date: new Date().toISOString(),
        questions: questions || [],
        answers: answers || [],
        step: newStep
      };

      const updatedReviews = [...(entry.reviews || []), newReview];

      const { error } = await supabase
        .from('revisoes')
        .update({
          step: newStep,
          revisoes: updatedReviews,
          data_ultima_revisao: new Date().toISOString()
        })
        .eq('id', entryId);

      if (error) {
        console.error('Erro ao completar revisão:', error);
        toast({
          title: "Erro ao salvar revisão",
          description: "Tente novamente",
          variant: "destructive"
        });
        return;
      }

      // Atualizar estado local
      setLearningEntries(prev => 
        prev.map(e => 
          e.id === entryId 
            ? { ...e, step: newStep, reviews: updatedReviews }
            : e
        )
      );

      toast({
        title: "Revisão concluída!",
        description: `Aprendizado #${String(entry.numeroId).padStart(4, '0')} atualizado com sucesso.`
      });
    } catch (error) {
      console.error('Erro inesperado ao completar revisão:', error);
      toast({
        title: "Erro inesperado",
        description: "Tente novamente",
        variant: "destructive"
      });
    }
  };

  // Calcular revisões pendentes
  const calculateReviewsToday = (entries: LearningEntry[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const intervals = [1, 3, 7, 14, 30, 60]; // days
    
    return entries.filter(entry => {
      const createdDate = new Date(entry.createdAt);
      createdDate.setHours(0, 0, 0, 0);
      
      const daysDiff = Math.floor((today.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
      const currentStep = entry.step || 0;
      
      return daysDiff >= intervals[currentStep];
    });
  };

  const reviewsToday = calculateReviewsToday(learningEntries);

  useEffect(() => {
    loadEntries();
  }, []);

  return {
    learningEntries,
    reviewsToday,
    loading,
    addLearningEntry,
    completeReview,
    refreshEntries: loadEntries
  };
};

import TablizerLayout from '../../components/tablizer/TablizerLayout';
import TablizePubMed from '../../components/tools/TablizePubMed';

export default function TablizerAppPage() {
    return (
        <TablizerLayout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <TablizePubMed />
            </div>
        </TablizerLayout>
    );
}
